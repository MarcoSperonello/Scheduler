import Db from '../database';
import Logger from '../logger';

import fs from 'fs';
import JobTemplate from '../nDrmaa/JobTemplate';
import SessionManager from '../nDrmaa/sge/SessionManager';
import * as sgeClient from '../nDrmaa/sge/sge-cli';
import * as monitors from './monitors';

// Possible job types. A SINGLE job consists of a single task, while an ARRAY
// job is made up of several tasks.
export const JOBTYPE = {
  SINGLE: 'SINGLE',
  ARRAY: 'ARRAY'
};

// Handles creation of Drmaa sessions.
export const sessionManager = new SessionManager();

/**
 * Class that manages client requests to submit a job to the Sun Grid Engine
 * (SGE).
 *
 * Job can either be SINGLE or ARRAY. SINGLE jobs consist of a single task,
 * while ARRAY jobs feature multiple ones.
 * Job submission and handling is bound by the following constraints:
 *  - maximum number of requests per user per time unit
 *  - maximum number of requests per time unit for all users
 *  - blacklisted and whitelisted users
 *  - maximum number of concurrent jobs (in any state)
 *  - maximum allotted runtime, after which the job is forcibly terminated.
 *
 * There are two kinds of time limits: the "queued" time limit, which dictates
 * how long a job can be in a non-RUNNING state, and the "running" time limit,
 * used to restrict the time spent in a RUNNING state by a job. SINGLE and ARRAY
 * jobs time limit pairs are different (i.e. the 'queued' and/or 'running' time
 * limit of a SINGLE job can be different than those of a RUNNING job).
 * These constraints are configured in the input.json file, to be placed in the
 * root of the project directory (temporary arrangement).
 *
 * INSTANTIATION:
 * The class constructor is called automatically and the input file, whose path
 * is passed to the constructor, is read in order to configure the class
 * parameters. Said file is then read every time a request is received by the
 * server (provided the last read happened a long enough time ago), so dynamic
 * configuration of input parameters is supported. Refer to the sample file and
 * the constructor comments for further details regarding the input parameters.
 *
 * USAGE:
 * This class is meant to be accessed by the outside via the handleRequest
 * method, which returns a promise. This method accepts a requestData object
 * with the following structure:
 *
 * {
 *       ip: {string}
 *       time: {Date}
 *       jobPath: {JSON object}
 * }
 * where:
 * - "ip" is the IP address of the user who submitted the request (or, more
 * generally, their name);
 * - "time" is the time at which the request was received;
 * - "jobPath" is a JSON with all or some fields of a JobTemplate object (see
 * ../nDrmaa/JobTemplate.js) plus three additional parameters: (1) start, (2)
 * end, (3) incr, which represent the numbers of the first task, the last task,
 * and the step size of an ARRAY job respectively (see the qsub -t manual).
 *
 * The handleRequest method proceeds to verify whether any of the aforementioned
 * constraints are violated. If they are not, handleRequest calls the
 * handleJobSubmission method which attempts to submit the job to the SGE. The
 * handleRequest method eventually returns a promise object, containing several
 * information regarding the outcome of the request (see handleRequest
 * documentation).
 */
class SchedulerSecurity {
  constructor(inputFile) {
    this.inputFile_ = inputFile;  // File from which to read input parameters.
    this.jobs_ = [];              // Jobs list.
    this.users_ = [];             // Users list.
    this.globalRequests_ = [];    // Recent requests by all users.
    this.blacklist_ = [];  // Requests from blacklisted users are rejected.
    this.whitelist_ = [];  // Requests from blacklisted users are rejected.
    this.userPollingIntervalID_ = null;
    this.listPollingIntervalID_ = null;
    this.inputParams_ = {
      // Max number of requests per user per time unit (requestLifespan).
      maxRequestsPerSecUser: 2,
      // Max number of requests per time unit for all users.
      maxRequestsPerSecGlobal: 4,
      // Maximum time allowed to pass after the most recent request of a user
      // before the user is removed from history.
      userLifespan: 1000000,
      // Time after which a request can be removed from history.
      requestLifespan: 5000,
      // Maximum number of concurrent jobs (either RUNNING, QUEUED, ON_HOLD...).
      maxConcurrentJobs: 1,
      // Time after which a RUNNING job can be forcibly stopped.
      maxJobRunningTime: 10000,
      // Time after which a QUEUED job can be forcibly stopped.
      maxJobQueuedTime: 10000,
      // Time after which an array job whose first task is RUNNING can be
      // forcibly stopped.
      maxArrayJobRunningTime: 10000,
      // Time after which an array job whose first task is QUEUED can be
      // forcibly stopped.
      maxArrayJobQueuedTime: 10000,
      // Path of the local black/whitelist file.
      localListPath: '',
      // Path of the global black/whitelist file.
      globalListPath: '',
      // Minimum time between two consecutive input file reads.
      minimumInputUpdateInterval: 5000,
      // Time of the last input file read.
      lastInputFileUpdate: 0,
      // Time interval between two consecutive job history polls.
      jobPollingInterval: 1000,
      // Time interval between two consecutive user history polls.
      userPollingInterval: 1000,
      // Time interval between two consecutive black/whitelist file reads.
      listPollingInterval: 1000,
      // Name of the Drmaa session.
      sessionName: 'session',
    };

    // Sets input parameters as specified in the input file. If there is an
    // error reading the input file, default parameters are set.
    this.updateInputParameters();
    // Checks if there are any users to be added to the black/whitelist.
    this.updateLists();

    // Creates a Drmaa session using the specified session name.
    sessionManager.createSession(this.sessionName_);

    /*// Polls the user history as often as specified.
    setInterval(monitors.monitorUsers.bind(this), this.userPollingInterval_);
    // Updates the black/whitelists as often as specified.
    setInterval(this.updateLists.bind(this), this.listPollingInterval_);*/

    /*
    setInterval(function() {
      console.log("this.maxRequestsPerSecUser_ " +
   this.maxRequestsPerSecUser_);
      console.log("this.maxRequestsPerSecGlobal_ " +
   this.maxRequestsPerSecGlobal_);
      console.log("userLifeSpan_ " + this.userLifespan_);
      console.log('localListPath_ ' + this.localListPath_);
    }.bind(this), 1000);
    */

    /*    setInterval( () => {
          for (let user of this.blacklist_) {
            Logger.info('blacklisted user ' + user);
          }
          console.log('\n');
        }, 5000);*/
    console.log('job size ' + this.jobs_.length);
  }

  /**
   * Handles a job submission request by a user. If no constraints are violated,
   * the request is accepted and forwarded to the SGE.
   *
   * The promise, either resolved (if the job is successfully submitted) or
   * rejected (if it is not), consists of a JSON object with the following
   * fields:
   *
   * {
   *       ip {string}
   *       time {Date}
   *       jobData {JSON object}
   *       description {string}
   * }
   * where:
   * - "ip" is the IP address of the user who submitted the request (or, more
   * generally, their name);
   * - "time" is the time at which the request was received;
   * - "jobData" is comprised of several useful information of the submitted job
   * (see handleJobSubmission documentation). If the job could not be submitted,
   * this field is null;
   * - "description" a brief description of the outcome of the request (whether
   * it succeeded or the reason it failed).
   *
   * @param requestData: object holding request information (user, ip, jobPath)
   */
  handleRequest(requestData) {
    return new Promise((resolve, reject) => {

      // Removes the :ffff: prefix from the ip address, if present.
      requestData.ip = requestData.ip.replace(/^.*:/, '');

      // Fetches the index in the users array corresponding to that of the user
      // who submitted the request.
      let userIndex = this.findUserIndex(this.users_, requestData);
      Logger.info(
          'Request received by ' + requestData.ip + ' at ' +
          new Date(requestData.time).toUTCString() + '.');

      // If a long enough time has passed since the last read of the input file,
      // it is read again and the input parameters are updated.
      if (new Date().getTime() - this.lastInputFileUpdate_ >
          this.minimumInputUpdateInterval_) {
        this.updateInputParameters();
      }

      // Object to resolve or reject the promise with.
      let information = {
        ip: requestData.ip,
        time: requestData.time,
        jobData: null,
        description: '',
      };

      // Checks whether any constraints are violated.
      let verifyOutcome = this.verifyRequest(requestData, userIndex);

      // If no constraints are violated, the job can be submitted to the SGE.
      if (verifyOutcome.status) {
        // Adds the user to the users array if it was not already present (first
        // time user) or updates its properties (time at which the request was
        // received, and total number of requests still in the user history)
        // otherwise.
        if (userIndex === -1) {
          Logger.info('Creating user ' + requestData.ip + '.');
          // The new user is added to the user list along with the request
          // timestamp.
          this.users_.push({
            ip: requestData.ip,
            requests: [requestData.time],
            requestAmount: 1,
          });
        } else {
          Logger.info('User ' + requestData.ip + ' found.');
          this.users_[userIndex].requests.push(requestData.time);
          this.users_[userIndex].requestAmount++;
        }
        // Adds the request to the global requests array.
        this.globalRequests_.push(requestData.time);
        this.registerRequestToDatabase(requestData);
        // Attempts to submit the job to the SGE.
        this.handleJobSubmission(requestData)
            .then(
                (jobData) => {
                  information.jobData = jobData;
                  information.description =
                      'Request accepted: job ' + jobData.jobId + ' submitted.';
                  resolve(information);
                },
                (error) => {
                  information.description = error;
                  reject(information);
                });
      }
      // One or more constraints were violated. The job cannot be submitted.
      else {
        // Logger.info('Request denied.');
        information.description =
            'Request denied: ' + verifyOutcome.description;
        reject(information);
      }

    });
  }

  /**
   * Attempts to submit a job to the SGE.
   *
   * If the job is successfully submitted, the promise is resolved to a JSON
   * object with the following structure:
   *
   * {
   *      jobId {integer}
   *      jobName {string}
   *      firstTaskId {integer}
   *      lastTaskId {integer}
   *      increment {integer}
   *      taskInfo {array}
   *      user {string}
   *      submitDate {Date}
   *      totalExecutionTime {integer}
   *      jobType {const String}
   * }
   * where:
   * - jobId is the numeric identified of the job, determined by the SGE;
   * - jobName is the name of the job;
   * - firstTaskId is the number of the first task of the ARRAY job;
   * - lastTaskId is the number of the last task of the ARRAY job;
   * - increment is the step size of the ARRAY job;
   * - taskInfo is an array containing the following parameters for each task of
   * an ARRAY job: the task id (taskId), status, time spent in RUNNING state
   * (runningTime), time at which the task started running (runningStart);
   * - user is the ip address of the user who submitted the request;
   * - submitDate is the date at which the job was submitted to the SGE;
   * - totalExecutionTime is the sum of the time spent in the RUNNING state by
   * each task of an ARRAY job;
   * - jobType specifies whether the job is of the SINGLE or ARRAY type.
   *
   * Note: the parameters specific to ARRAY jobs are irrelevant and should be
   * ignored if the jobType is SINGLE.
   * Note: if the jobType is ARRAY, the runningTime and runningStart fields of
   * each task as well as the totalExecutionTime of the job are initially all
   * set to zero.
   *
   * If the job could not be submitted, the promise is rejected with a brief
   * description explaining why the operation failed.
   *
   * @param requestData: object holding request information (user, ip, jobPath)
   */
  handleJobSubmission(requestData) {
    return new Promise((resolve, reject) => {

      try {
        // Loads job specifications from file.
        let jobInfo = JSON.parse(fs.readFileSync(requestData.jobPath, 'utf8'));
        let jobData = new JobTemplate({
          remoteCommand: jobInfo.remoteCommand,
          args: jobInfo.args || [],
          submitAsHold: jobInfo.submitAsHold || false,
          jobEnvironment: jobInfo.jobEnvironment || '',
          workingDirectory: jobInfo.workingDirectory || '',
          jobCategory: jobInfo.jobCategory || '',
          nativeSpecification: jobInfo.nativeSpecification || '',
          email: jobInfo.email || '',
          blockEmail: jobInfo.blockEmail || true,
          startTime: jobInfo.startTime || '',
          jobName: jobInfo.jobName || '',
          inputPath: jobInfo.inputPath || '',
          outputPath: jobInfo.outputPath || '',
          errorPath: jobInfo.errorPath || '',
          joinFiles: jobInfo.joinFiles || '',
        });

        // Number of the first task of the job array.
        let start = jobInfo.start || null;
        // Number of the last task of the job array.
        let end = jobInfo.end || null;
        // Step size (size of the increments to go from "start" to "end").
        let increment = jobInfo.incr || null;

        // Determines if the job consists of a single task or multiple ones.
        let jobType = this.checkArrayParams(start, end, increment);

        // Submits the job to the SGE.
        sessionManager.getSession(this.sessionName_).then((session) => {
          // A different submission function is called, according to the JOBTYPE
          // of the job.
          let jobFunc = jobType === JOBTYPE.SINGLE ?
              session.runJob(jobData) :
              session.runBulkJobs(jobData, start, end, increment);
          jobFunc.then(
              (jobId) => {
                // Fetches the date and time of submission of the job.
                session.getJobProgramStatus([jobId]).then((jobStatus) => {
                  sgeClient.qstat(jobId).then((job) => {
                    // Converts the date to an ms-from-epoch format.
                    let jobSubmitDate = new Date(job.submission_time).getTime();
                    let taskInfo = [];
                    // If the job is of the ARRAY type, all of its task are
                    // added
                    // to the taskInfo array.
                    if (jobType === JOBTYPE.ARRAY) {
                      for (let taskId = start; taskId <= end;
                           taskId += increment) {
                        console.log(
                            'task ' + taskId + ' status: ' +
                            jobStatus[jobId].tasksStatus[taskId].mainStatus);
                        taskInfo.push({
                          // The ID of the task.
                          taskId: taskId,
                          // The status of the task.
                          status:
                              jobStatus[jobId].tasksStatus[taskId].mainStatus,
                          // Time the task has spent in the RUNNING state.
                          runningTime: 0,
                          // Time at which the task switched to the RUNNING
                          // state.
                          runningStart: 0,
                        })
                      }
                    }

                    // Adds the job to the job history.
                    let jobDescription = {
                      jobId: jobId,
                      jobName: job.job_name,
                      jobStatus: jobStatus[jobId].mainStatus,
                      firstTaskId: jobType === JOBTYPE.SINGLE ? null : start,
                      lastTaskId: jobType === JOBTYPE.SINGLE ? null : end,
                      increment: jobType === JOBTYPE.SINGLE ? null : increment,
                      taskInfo: taskInfo,
                      user: requestData.ip,
                      submitDate: jobSubmitDate,
                      // Total execution time of a job array (the sum of the
                      // runningTimes of all tasks).
                      totalExecutionTime: 0,
                      jobType: jobType,
                    };
                    // Adds the job to the job array.
                    this.jobs_.push(jobDescription);
                    Logger.info(
                        'Added job ' + jobId + ' (' + job.job_name + ') on ' +
                        new Date(jobSubmitDate).toUTCString());
                    Logger.info(
                        'Added job ' + jobId + ' (' + job.job_name +
                        ') to job history. Current job history size: ' +
                        this.jobs_.length + '.');
                    resolve(jobDescription);
                  });
                });
              },
              () => {
                Logger.info(
                    'Error found in job specifications. Job not submitted to the SGE.');
                reject(
                    'Error found in job specifications. Job not submitted to the SGE.');
              });
        });
      } catch (err) {
        Logger.info(
            'Error reading job specifications from file. Job not submitted to the SGE.');
        reject(
            'Error reading job specifications from file. Job not submitted to the SGE.');
      }
    });
  }

  /**
   * Returns true if the request can be serviced, along with a brief description
   * of the reason why (or why not).
   *
   * @param requestData: object holding request information.
   * @param userIndex: the corresponding index of the users_ array of the user
   * submitting the request.
   * @returns {object} status: true if the request is accepted, description:
   * brief description of the outcome of the checks.
   */
  verifyRequest(requestData, userIndex) {
    let checkResult = this.checkUserRequests(requestData, userIndex);
    if (!checkResult.status)
      return {status: false, description: checkResult.description};
    /*    if (this.jobs_.length >= this.maxConcurrentJobs_)
          return {
            status: false,
            description: 'Maximum number (' + this.maxConcurrentJobs_ +
                ') of concurrent jobs already reached. Cannot submit any more
       jobs at the moment.'
          };*/
    return {status: true, description: 'All checks passed.'};
  }

  /**
   * Verifies whether any request-per-time-unit constraints would be violated by
   * the input request.
   *
   * @param requestData: object holding request information.
   * @param userIndex: the user which submitted the request.
   * @returns {object} status: true if no constraints are violated, description:
   * empty string if status is set to "true", otherwise it is a brief
   * description of what constraint was violated.
   */
  checkUserRequests(requestData, userIndex) {
    // If the user is blacklisted, the request is rejected.
    if (this.isBlacklisted(requestData))
      return {
        status: false,
        description: 'User ' + requestData.ip + ' is blacklisted'
      };

    // If the user is whitelisted, the request is accepted.
    if (this.isWhitelisted(requestData)) return {status: true, description: ''};

    if (this.jobs_.length >= this.maxConcurrentJobs_)
      return {
        status: false,
        description: 'Maximum number (' + this.maxConcurrentJobs_ +
            ') of concurrent jobs already reached. Cannot submit any more jobs at the moment.'
      };

    // If the server is already at capacity, additional requests cannot be
    // serviced.
    if (!this.checkGlobalRequests(requestData))
      return {
        status: false,
        description: 'Server currently at capacity (' +
            this.globalRequests_.length +
            ' global requests present). Cannot service more requests.'
      };

    if (userIndex === -1) return {status: true, description: ''};

    let user = this.users_[userIndex];

    // If the user's request history is not full, the request can be serviced.
    if (user.requestAmount < this.maxRequestsPerSecUser_)
      return {status: true, description: ''};

    // If there are expired user requests, they are pruned and the current
    // request can be serviced.
    for (let i = user.requests.length - 1; i >= 0; i--) {
      if (requestData.time - user.requests[i] > this.requestLifespan_) {
        user.requests.splice(0, i + 1);
        user.requestAmount -= (i + 1);
        // console.log("Removed " + (i + 1) + " request(s) from user " + user.ip
        // + " request history. "
        //    + "There are currently " + user.requests.length + " request(s) in
        //    the user's history.");
        return {status: true, description: ''};
      }
    }

    // If no user requests were pruned, the user is already at capacity.
    // Additional requests cannot be serviced.
    /*    Logger.info(
            'User ' + user.ip +
            ' cannot submit more requests right now: there are currently ' +
            user.requests.length + ' request(s) in the user\'s history.');*/
    return {
      status: false,
      description: 'User ' + user.ip +
          ' cannot submit more requests right now: there are currently ' +
          user.requests.length + ' request(s) in the user\'s history.'
    };
  }

  /**
   * Verifies whether the global request-per-time-unit constraint would be
   * violated by the input request.
   *
   * @param requestData: object holding request information (user, ip, jobPath).
   * @returns {boolean} true if no constraints are violated.
   */
  checkGlobalRequests(requestData) {
    // Pruning of expired global requests, if any.
    // console.log("globalRequests_.length: " + this.globalRequests_.length);
    for (let i = this.globalRequests_.length - 1; i >= 0; i--) {
      if (requestData.time - this.globalRequests_[i] > this.requestLifespan_) {
        this.globalRequests_.splice(0, i + 1);
        // console.log("Removed " + (i + 1) + " request(s) from global request
        // history. "
        //    + "There are currently " + this.globalRequests_.length + " global
        //    request(s).");
        break;
      }
    }

    // If the server is already at capacity, additional requests cannot be
    // serviced.
    if (this.globalRequests_.length >= this.maxRequestsPerSecGlobal_) {
      // console.log("globalRequests_.length: " + this.globalRequests_.length +
      // ".
      // Cannot service more requests.");
      Logger.info(
          'Server currently at capacity (' + this.globalRequests_.length +
          ' global requests currently present). Cannot service more requests.');
      return false;
    }
    return true;
  }

  /**
   * Checks if the user is blacklisted.
   *
   * @param requestData: object holding request information (user, ip, jobPath).
   * @returns {boolean} true if the user is blacklisted.
   */
  isBlacklisted(requestData) {
    if (this.blacklist_.findIndex((elem) => {
          let regexp = new RegExp(elem);
          if (regexp.test(requestData.ip)) return elem;
        }) !== -1) {
      Logger.info('User ' + requestData.ip + ' is blacklisted.');
      return true;
    }
    return false;
  }

  /**
   * Checks if the user is whitelisted.
   *
   * @param requestData: object holding request information (user, ip, jobPath).
   * @returns {boolean} true if the user is whitelisted.
   */
  isWhitelisted(requestData) {
    if (this.whitelist_.findIndex((elem) => {
          let regexp = new RegExp(elem);
          if (regexp.test(requestData.ip)) return elem;
        }) !== -1) {
      Logger.info('User ' + requestData.ip + ' is whitelisted.');
      return true;
    }
    return false;
  }

  /**
   * Logs a request (ip and timestamp) to database.
   *
   * @param requestData: object holding request information (user, ip, jobPath).
   */
  registerRequestToDatabase(requestData) {
    Logger.info('Logging request to database.');
    Db.performInsertOne(requestData, 'test');
  }

  /**
   * Returns the index of the element of the array corresponding to the user who
   * submitted the input request.
   *
   * @param userArray: the array the user who submitted the request belongs to.
   * @param requestData: object holding request information (user, ip, jobPath).
   * @returns {number} the index of the element corresponding to the user who
   * submitted the request.
   *    Returns -1 if the user is not found.
   */
  findUserIndex(userArray, requestData) {
    return userArray.findIndex(
        (elem) => { return elem.ip === requestData.ip; });
  }

  /**
   * Verifies if the start, end and increment parameters for an array job are
   * valid.
   *
   * @param start: index of the first task.
   * @param end: index of the last task.
   * @param increment: index increment.
   * @returns {string} JOBTYPE.SINGLE if the check fails, JOBTYPE.ARRAY
   * otherwise.
   */
  checkArrayParams(start, end, increment) {
    return (!Number.isInteger(start) || !Number.isInteger(end) ||
            !Number.isInteger(increment) || start <= 0 || end < start ||
            start + increment > end) ?
        JOBTYPE.SINGLE :
        JOBTYPE.ARRAY;
  }

  /**
   * Updates the local monitors to check the user history and the local and
   * global black/whitelist files periodically.
   * The frequencies of these checks are specified in the input file.
   */
  updateMonitors() {
    // Clears pre-existing intervals.
    if (this.userPollingIntervalID_ !== null)
      clearInterval(this.userPollingIntervalID_);
    if (this.listPollingIntervalID_ !== null)
      clearInterval(this.listPollingIntervalID_);

    // Polls the user history as often as specified.
    this.userPollingIntervalID_ = setInterval(
        monitors.monitorUsers.bind(this), this.userPollingInterval_);
    // Updates the black/whitelists as often as specified.
    this.listPollingIntervalID_ =
        setInterval(this.updateLists.bind(this), this.listPollingInterval_);
  }
  /**
   * Attempts to read the local and global black/whitelist files and update the
   * arrays of the blacklisted and whitelisted users.
   */
  updateLists() {
    if (this.localListPath_ !== '') {
      try {
        let localList =
            JSON.parse(fs.readFileSync(this.localListPath_, 'utf8'));
        if (localList.hasOwnProperty('whitelist'))
          this.whitelist_ = localList.whitelist;
        if (localList.hasOwnProperty('blacklist'))
          this.blacklist_ = localList.blacklist;
        // Removes duplicates.
        this.whitelist_ = Array.from(new Set(this.whitelist_));
        this.blacklist_ = Array.from(new Set(this.blacklist_));
      } catch (err) {
        Logger.info(
            'Error while reading local lists file ' + this.localListPath_ +
            '.');
      }
    }

    if (this.globalListPath_ !== '') {
      try {
        let globalList =
            JSON.parse(fs.readFileSync(this.globalListPath_, 'utf8'));
        if (globalList.hasOwnProperty('whitelist')) {
          // Joins the global whitelist with the local one, removing duplicates.
          this.whitelist_ =
              Array.from(new Set(this.whitelist_.concat(globalList.whitelist)));
        }
        if (globalList.hasOwnProperty('blacklist')) {
          // Joins the global blacklist with the local one, removing duplicates.
          this.blacklist_ =
              Array.from(new Set(this.blacklist_.concat(globalList.blacklist)));
        }
      } catch (err) {
        Logger.info(
            'Error while reading global lists file ' + this.globalListPath_ +
            '.');
      }
    }
  }

  /**
   * Attempts to read the input file and update the input parameters.
   * Time related parameters are multiplied by 1000 in order to convert seconds
   * to milliseconds.
   */
  updateInputParameters() {
    try {
      this.inputParams_ = JSON.parse(fs.readFileSync(this.inputFile_, 'utf8'));
      Logger.info('Successfully read input file ' + this.inputFile_ + '.');
    } catch (err) {
      Logger.info(
          'Error while reading input file ' + this.inputFile_ +
          '. Using default parameters.');
    }

    this.maxRequestsPerSecUser_ = this.inputParams_.maxRequestsPerSecUser || 2;
    this.maxRequestsPerSecGlobal_ =
        this.inputParams_.maxRequestsPerSecGlobal || 4;
    this.userLifespan_ = this.inputParams_.userLifespan * 1000 || 1000000;
    this.requestLifespan_ = this.inputParams_.requestLifespan * 1000 || 5000;
    this.maxConcurrentJobs_ = this.inputParams_.maxConcurrentJobs || 1;
    this.maxJobRunningTime_ =
        this.inputParams_.maxJobRunningTime * 1000 || 10000;
    this.maxJobQueuedTime_ = this.inputParams_.maxJobQueuedTime * 1000 || 10000;
    this.maxArrayJobRunningTime_ =
        this.inputParams_.maxArrayJobRunningTime * 1000 || 10000;
    this.maxArrayJobQueuedTime_ =
        this.inputParams_.maxArrayJobQueuedTime * 1000 || 10000;
    this.localListPath_ = this.inputParams_.localListPath || '';
    this.globalListPath_ = this.inputParams_.globalListPath || '';
    this.minimumInputUpdateInterval_ =
        this.inputParams_.minimumInputUpdateInterval * 1000 || 10000;
    this.lastInputFileUpdate_ = new Date().getTime();

    this.jobPollingInterval_ =
        this.inputParams_.jobPollingInterval * 1000 || 1000;
    this.userPollingInterval_ =
        this.inputParams_.userPollingInterval * 1000 || 1000;
    this.listPollingInterval_ =
        this.inputParams_.listPollingInterval * 1000 || 1000;
    this.updateMonitors();

    this.sessionName_ = this.inputParams_.sessionName || 'session';
  }
}

export const Sec = new SchedulerSecurity('./input_files/input.json');
