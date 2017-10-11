import Db from '../database';
import Logger from '../logger';

import fs from 'fs';
import JobTemplate from '../nDrmaa/JobTemplate';
import SessionManager from '../nDrmaa/sge/SessionManager';
import * as sgeClient from '../nDrmaa/sge/sge-cli';
import * as monitors from './monitors';

/** Possible job types. A SINGLE job consists of a single task, while an ARRAY
 * job is made up of several tasks.
 *
 * @typedef JOBTYPE
 * @type {{SINGLE: string, ARRAY: string}}
 * @const
 */
export const JOBTYPE = {
  SINGLE: 'SINGLE',
  ARRAY: 'ARRAY'
};

// Handles creation of Drmaa sessions.
export const sessionManager = new SessionManager();

/**
 * Class that manages client requests to submit a job to the Sun Grid Engine
 * (SGE).<br><br>
 *
 * Job can either be SINGLE or ARRAY. SINGLE jobs consist of a single task,
 * while ARRAY jobs feature multiple ones.<br>
 * Job submission and handling is bound by the following constraints:<br>
 *  - maximum number of requests per user per time unit<br>
 *  - maximum number of requests per time unit for all users<br>
 *  - blacklisted and whitelisted users<br>
 *  - maximum number of concurrent jobs (in any state)<br>
 *  - maximum allotted runtime, after which the job is forcibly terminated.<br>
 * <br>
 * There are two kinds of time limits: the "queued" time limit, which dictates
 * how long a job can be in a non-RUNNING state, and the "running" time limit,
 * used to restrict the time spent in a RUNNING state by a job. SINGLE and ARRAY
 * jobs time limit pairs are different (i.e. the 'queued' and/or 'running' time
 * limit of a SINGLE job can be different than those of a RUNNING job).<br>
 * These constraints are configured in the input.json file, to be placed in the
 * root of the project directory (temporary arrangement).<br><br>
 *
 * INSTANTIATION:<br>
 * The class constructor is called automatically and the input file, whose path
 * is passed to the constructor, is read in order to configure the class
 * parameters. Said file is then read every time a request is received by the
 * server (provided the last read happened a long enough time ago), so
 * reconfiguration of input parameters during runtime is supported.
 * Refer to the sample file and the constructor comments for further details
 * regarding the input parameters.
 * <br><br>
 * USAGE:<br>
 * This class is meant to be accessed by the outside via the
 * [handleRequest]{@link scheduler/SchedulerManager#handleRequest} method, which
 * returns a promise.<br> Said method proceeds to verify whether any of the
 * aforementioned constraints are violated. If they are not, this method calls
 * the [handleJobSubmission]{@link
    * scheduler/SchedulerManager#handleJobSubmission} method which attempts to
 * submit the job to the SGE. [handleRequest]{@link
    * scheduler/SchedulerManager#handleRequest} returns a promise which
 * eventually
 * resolves into a {@link requestOutcome} object containing several information
 * regarding the outcome of the request.
 * <br><br>
 * Please refer to the [tutorial]{@tutorial SchedulerManager} for an in-depth
 * explanation.
 *
 * @tutorial SchedulerManager
 *
 * @alias scheduler/SchedulerManager
 */
class SchedulerManager {
  /**
   * Reads the input parameters from the specified file and initializes class
   * variables to these values. If the file cannot be found or not all
   * parameters are specified within it, the missing parameters are initialized
   * to default values.
   * @param {string} inputFile - the path of the file with the input parameters.
   */
  constructor(inputFile) {
    /** The path of the file from which to read the input parameters.
     * @type {string}
     * @private
     */
    this.inputFile_ = inputFile;
    /** Job history, consisting of the jobs submitted to the SGE and not yet
     * completed or deleted.
     * @type {Object}
     * @private
     */
    this.jobs_ = {};
    /** Counts the number of jobs which have not yet been submitted to the SGE.
     * @type {number}
     * @private
     */
    this.pendingJobsCounter_ = 0;
    /** User history, consisting of the users who have not exceeded their
     * maximum lifespan ([userLifespan]{@link
        * scheduler/SchedulerManager#userLifespan_}).
     * @type {array}
     */
    this.users_ = [];
    /** Recent request history by all users, consisting of the request which
     * have not exceeded their maximum lifespan ([requestLifespan]{@link
        * scheduler/SchedulerManager#requestLifespan_}).
     * @type {array}
     */
    this.globalRequests_ = [];
    /** Blacklisted users.
     * @type {Array}
     * @private
     */
    this.blacklist_ = [];
    /** Whitelisted users.
     * @type {array}
     * @private
     */
    this.whitelist_ = [];
    /** Current setInterval ID of the [monitorUsers]{@link
        * modules:scheduler/monitors.monitorUsers} function, called in
     * [updateMonitors]{@link scheduler/SchedulerManager.updateMonitors}.
     * @type {number}
     * @default null
     * @private
     */
    this.userPollingIntervalID_ = null;
    /** Current setInterval ID of the [updateLists]{@link
        * scheduler/SchedulerManager.updateLists} function, called in
     * [updateMonitors]{@link scheduler/SchedulerManager.updateMonitors}.
     * @type {number}
     * @default null
     * @private
     */
    this.listPollingIntervalID_ = null;
    /**
     * Helper object to initialize class variables to their default values when
     * the constructor is called. Said variables are then updated to their
     * respective values specified in the [input file]{@link
        * scheduler/SchedulerManager#inputFile_} via
     * [updateInputParameters]{@link
        * scheduler/SchedulerManager#updateInputParameters}.
     * This "preemptive" initialization is necessary since this class is
     * instantiated only once and the class variables are periodically updated
     * during runtime via [updateInputParameters]{@link
        * scheduler/SchedulerManager#updateInputParameters}.
     *
     * @type {Object}
     * @private
     */
    // See the updateInputParameters method for a description of each of these
    // variables.
    this.inputParams_ = {
      maxRequestsPerSecUser: 2,
      maxRequestsPerSecGlobal: 4,
      userLifespan: 10,
      requestLifespan: 5,
      maxConcurrentJobs: 1,
      maxJobRunningTime: 10,
      maxJobQueuedTime: 10,
      maxArrayJobRunningTime: 10,
      maxArrayJobQueuedTime: 10,
      localListPath: '',
      globalListPath: '',
      minimumInputUpdateInterval: 5,
      lastInputFileUpdate: 0,
      jobPollingInterval: 1,
      userPollingInterval: 1,
      listPollingInterval: 1,
    };

    // Sets input parameters as specified in the input file. If there is an
    // error reading the input file, default parameters are set.
    this.updateInputParameters();

    /*setInterval( () => {
      for (let user of this.whitelist_) {
        console.log('whitelisted user ' + user);
      }
    }, 5000);*/
  }

  /**
   * Relevant information of a user request.
   * @typedef {Object} requestData
   * @property {string} ip - The IP address of the user.
   * @property {string} time - The time at which the request was received.
   * @property {Object} jobData - Job specifications.
   */

  /**
   * Relevant information regarding the outcome of a user request.
   * @typedef {Object} requestOutcome
   * @property {string} ip - The IP address of the user who submitted the
   * request.
   * @property {string} time - The time at which the request was received.
   * @property {[JobDescription]{@link jobDescription} jobData -  Relevant
   * information regarding a submitted job.
   * @property {string} description - Brief description of the outcome of the
   * request (accepted or rejected).
   * @property {string} errors - Brief description of why the request
   * cannot be serviced as specified in {@link requestStatus}; empty if it can
   * be serviced.
   */

  /**
   * Status of a user request. Helper object to determine whether a user request
   * passes all checks and can be serviced.
   * @typedef {Object} requestStatus
   * @property {boolean} status - True if no constraints have been violated by
   * the user request.
   * @property {string} errors - Brief description of why the request
   * cannot be serviced, empty if it can be serviced.
   */

  /**
   * Relevant information regarding a submitted job.
   * @typedef {Object} jobDescription
   * @property {number} jobId - The unique identifier of the job, determined by
   * the SGE.
   * @property {string} jobName - The name of the job.
   * @property {string} sessionName - The UUID of the session the job was
   * launched in.
   * @property {number} firstTaskId - The number of the first task of the job if
   * it is a {@link JOBTYPE}.ARRAY job, null otherwise.
   * @property {number} lastTaskId - The number of the last task of the job if
   * it is a {@link JOBTYPE}.ARRAY, null otherwise.
   * @property {number} increment - The step size of the job if it is a {@link
      * JOBTYPE}.ARRAY job, null otherwise.
   * @property {array} taskInfo - Information for each task (see {@link
      * taskData}) of the job if it is a {@link JOBTYPE}.ARRAY job, null
   * otherwise.
   * @property {string} user - The IP address of the user who submitted the
   * request.
   * @property {string} submitDate - The time at which the job was submitted to
   * the SGE.
   * @property {string} totalExecutionTime - The sum of the time spent in the
   * RUNNING state by each task of the job if it is a {@link JOBTYPE}.ARRAY job.
   * @property {string} jobType - the type of the job as specified in {@link
      * JOBTYPE}.
   */

  /**
   * Relevant information of a task of a {@link JOBTYPE}.ARRAY job.
   * @typedef {Object} taskData
   * @property {number} taskId - The ID of the task.
   * @property {string} status - The status of the task. See
   * [getJobProgramStatus]{@link Session#getJobProgramStatus}.
   * @property {string} runningStart - The time at which the task switched to
   * the RUNNING state.
   * @property {string} runningTime - The time the task has spent in the RUNNING
   * state.
   */

  /**
   * Handles a job submission request by a user. If no constraints are violated,
   * the request is accepted and forwarded to the SGE.<br><br>
   *
   * The promise resolves only if the job could be submitted to the SGE.
   *
   * @param {requestData} requestData - Object containing request information.
   * @param {Session} session - The name of the session to launch the job in.
   * @returns {Promise}
   * <ul>
   *    <li>
   *      <b>Resolve</b> {{@link requestOutcome}} - Object holding information
   *      regarding the request and the submitted job.
   *    </li>
   *    <li>
   *      <b>Reject</b> {{@link requestOutcome}} - Object holding information
   *      regarding the request. Its jobData field is null.
   *    </li>
   * </ul>
   */
  handleRequest(requestData, session) {
    return new Promise((resolve, reject) => {
      // The counter is incremented because the job has still not been submitted
      // to the SGE, nor has the request been rejected.
      this.pendingJobsCounter_++;

      // Removes the :*: prefix from the ip address, if present.
      requestData.ip = requestData.ip.replace(/^.*:/, '');

      // Fetches the index in the users_ array corresponding to that of the user
      // who submitted the request.
      let userIndex = this.users_.findIndex(
          (elem) => { return elem.ip === requestData.ip; });

      Logger.info(
          'Request received by ' + requestData.ip + ' at ' +
          new Date(requestData.time) + '.');

      // If a long enough time has passed since the last read of the input file,
      // it is read again and the input parameters are updated.
      if (new Date().getTime() - this.lastInputFileUpdate_ >
          this.minimumInputUpdateInterval_) {
        this.updateInputParameters();
      }

      // Object to resolve or reject the promise with.
      let requestOutcome = {
        ip: requestData.ip,
        time: requestData.time,
        jobData: null,
        description: '',
        errors: null,
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

        // this.registerRequestToDatabase(requestData);
        // Attempts to submit the job to the SGE.
        this.handleJobSubmission(requestData, session)
            .then(
                (jobData) => {
                  requestOutcome.jobData = jobData;
                  requestOutcome.description =
                      'Request accepted: job ' + jobData.jobId + ' submitted.';
                  resolve(requestOutcome);
                },
                (error) => {
                  this.pendingJobsCounter_--;
                  requestOutcome.description = 'Request rejected.';
                  requestOutcome.errors = error;
                  reject(requestOutcome);
                });
      }
      // One or more constraints were violated. The job cannot be submitted.
      else {
        // The counter is decreased because the request has been rejected.
        this.pendingJobsCounter_--;
        requestOutcome.description = 'Request rejected.';
        requestOutcome.errors = verifyOutcome.errors;
        reject(requestOutcome);
      }

    });
  }

  /**
   * Attempts to submit a job to the SGE.<br><br>
   *
   * The promise is resolved only if the job could be submitted to the SGE, it
   * is otherwise rejected.
   *
   * @param {requestData} requestData - Object containing request information.
   * @param {Session} session - The name of the session to launch the job in.
   * @returns {Promise}
   * <ul>
   *    <li>
   *      <b>Resolve</b> {{@link jobDescription}} - Object containing several
   *      information about the job.
   *    </li>
   *    <li>
   *      <b>Reject</b> {string} - A brief description of why the job could not
   *      be submitted.
   *    </li>
   * </ul>
   */
  handleJobSubmission(requestData, session) {
    return new Promise((resolve, reject) => {

      try {
        let jobData = new JobTemplate(requestData.jobData);

        // Number of the first task of the job array.
        let start = requestData.jobData.start || null;
        // Number of the last task of the job array.
        let end = requestData.jobData.end || null;
        // Step size (size of the increments to go from "start" to "end").
        let increment = requestData.jobData.incr || null;

        // Determines if the job consists of a single task or multiple ones.
        let jobType = this.checkArrayParams(start, end, increment);

        // Submits the job to the SGE. A different submission function is
        // called, according to the JOBTYPE of the job.
        let jobFunction = jobType === JOBTYPE.SINGLE ?
            session.runJob(jobData) :
            session.runBulkJobs(jobData, start, end, increment);
        jobFunction.then(
            (jobId) => {
              // The counter is decreased because the job has been submitted.
              this.pendingJobsCounter_--;

              // Fetches the date and time of submission of the job.
              session.getJobProgramStatus([jobId]).then(
                  (jobStatus) => {
                    sgeClient.qstat(jobId).then(
                        (job) => {
                          // Converts the date to an ms-from-epoch format.
                          let jobSubmitDate =
                              new Date(job.submission_time).getTime();
                          let taskInfo = [];
                          // If the job is of the ARRAY type, all of its task
                          // are
                          // added to the taskInfo array.
                          if (jobType === JOBTYPE.ARRAY) {
                            for (let taskId = start; taskId <= end;
                                 taskId += increment) {
                              console.log(
                                  'task ' + taskId + ' status: ' +
                                  jobStatus[jobId]
                                      .tasksStatus[taskId]
                                      .mainStatus);
                              taskInfo.push({
                                // The ID of the task.
                                taskId: taskId,
                                // The status of the task.
                                status: jobStatus[jobId]
                                            .tasksStatus[taskId]
                                            .mainStatus,
                                // Time at which the task switched to the
                                // RUNNING
                                // state.
                                runningStart: 0,
                                // Time the task has spent in the RUNNING state.
                                runningTime: 0,
                              })
                            }
                          }

                          // Adds the job to the job history.
                          let jobDescription = {
                            jobId: jobId,
                            jobName: job.job_name,
                            sessionName: requestData.sessionName,
                            jobStatus: jobStatus[jobId].mainStatus,
                            firstTaskId: jobType === JOBTYPE.SINGLE ? null :
                                                                      start,
                            lastTaskId: jobType === JOBTYPE.SINGLE ? null : end,
                            increment: jobType === JOBTYPE.SINGLE ? null :
                                                                    increment,
                            taskInfo: taskInfo,
                            user: requestData.ip,
                            submitDate: jobSubmitDate,
                            // Total execution time of an ARRAY job (the sum of
                            // the
                            // runningTimes of all tasks).
                            totalExecutionTime: 0,
                            jobType: jobType,
                          };
                          // Adds the job to the jobs object_.
                          this.jobs_[jobId] = jobDescription;
                          Logger.info(
                              'Added job ' + jobId + ' (' + job.job_name +
                              ') on ' + new Date(jobSubmitDate));
                          Logger.info(
                              'Added job ' + jobId + ' (' + job.job_name +
                              ') to job history. Current job history size: ' +
                              Object.keys(this.jobs_).length + '.');
                          resolve(jobDescription);
                        },
                        (error) => { reject(error); });
                  },
                  (error) => { reject(error); });
            },
            (error) => {
              Logger.info(
                  'Error found in job specifications. Job not submitted to the SGE.');
              reject(error);
            });
      } catch (error) {
        Logger.info(
            'Error reading job specifications. Job not submitted to the SGE.');
        reject(error);
      }
    });
  }

  /**
   * Wrapper for the [monitorJob]{@link module:scheduler/monitors.monitorJob}
   * function. Keeps calling said function until the promise resolves or an
   * error occurs.
   *
   * @returns {Promise}
   * <ul>
   *    <li>
   *      <b>Resolve</b> {[jobStatusInformation]{@link
   *      module:scheduler/monitors~jobStatusInformation}} -
   *      Object containing several information about the job successfully
   *      submitted to the SGE.
   *    </li>
   *    <li>
   *      <b>Reject</b> {[jobStatusError]{@link
   *      module:scheduler/monitors~jobStatusError}} - Information regarding the
   *      failure to read the result of the job computation.
   *    </li>
   * </ul>
   */
  getJobResult() {
    // Parses the ID and the session of the job whose status needs to be
    // monitored.
    let jobId = Array.from(arguments);
    // Keeps calling the monitorJob function to monitor the job until the
    // promise resolves or an error occurs.
    return monitors.monitorJob.apply(null, jobId).catch((result) => {
      if (result.hasOwnProperty('monitoringError'))
        return Promise.reject(result);
      return this.getJobResult.apply(this, jobId);
    })
  }

  /**
   * Verifies if a request can be serviced. The result is contained in a {@link
   * requestStatus} object.
   *
   * @param {requestData} requestData - Object holding request information.
   * @param {number} userIndex - The corresponding index of the users_ array of
   * the user submitting the request.
   * @returns {requestStatus} status - Object storing the result of the checks.
   */
  verifyRequest(requestData, userIndex) {
    // If the user is blacklisted, the request is rejected.
    if (this.isBlacklisted(requestData))
      return {
        status: false,
        errors: 'User ' + requestData.ip + ' is blacklisted'
      };

    // If the user is whitelisted, the request is accepted.
    if (this.isWhitelisted(requestData)) return {status: true, errors: ''};

    let jobLength = Object.keys(this.jobs_).length;

    // If the number of pending job requests plus the number of current jobs
    // being handled by the SGE is bigger than the maximum number of concurrent
    // jobs, there is the risk (or the certainty, if the current number of jobs
    // in the SGE is already equal to the maximum number of concurrent jobs)
    // that said constraint might be violated, so the request is rejected.
    if (this.pendingJobsCounter_ + jobLength > this.maxConcurrentJobs_) {
      return {
        status: false,
        errors: jobLength === this.maxConcurrentJobs_ ?
            'Maximum number (' + this.maxConcurrentJobs_ +
                ') of concurrent jobs already reached. Cannot submit any more jobs at the moment.' :
            'Cannot submit the job without guaranteeing that the maxConcurrentJobs limit will not be exceeded.',
      };
    }

    // If the server is already at capacity, additional requests cannot be
    // serviced.
    if (!this.checkGlobalRequests(requestData))
      return {
        status: false,
        errors: 'Server currently at capacity (' + this.globalRequests_.length +
            ' global requests present). Cannot service more requests.'
      };

    if (userIndex === -1) return {status: true, errors: ''};

    let user = this.users_[userIndex];

    // If the user's request history is not full, the request can be serviced.
    if (user.requestAmount < this.maxRequestsPerSecUser_)
      return {status: true, errors: ''};

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
        return {status: true, errors: ''};
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
      errors: 'User ' + user.ip + ' cannot submit more requests right now: ' +
          user.requests.length + ' request(s) currently present' +
          ' in the user\'s history.'
    };
  }

  /**
   * Verifies whether the global request-per-time-unit constraint would be
   * violated by the input request.
   *
   * @param {requestData} requestData - Object holding request information.
   * @returns {boolean} True if no constraints are violated.
   */
  checkGlobalRequests(requestData) {
    // Pruning of expired global requests, if any.
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
   * @param {requestData} requestData - Object holding request information.
   * @returns {boolean} True if the user is blacklisted.
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
   * @param {requestData} requestData - Object holding request information.
   * @returns {boolean} True if the user is whitelisted.
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
   * Logs a request to database.
   *
   * @param {requestData} requestData - Object holding request information.
   */
  registerRequestToDatabase(requestData) {
    Logger.info('Logging request to database.');
    Db.performInsertOne(requestData, 'test');
  }

  /**
   * Verifies if the start, end and increment parameters for an array job are
   * valid.
   * If there are no logical errors but the sum of the start and increment
   * parameters is bigger than the end parameter, the job is classified as
   * {@link JOBTYPE}.SINGLE.
   *
   * @param {number} start - The index of the first task.
   * @param {number} end - The index of the last task.
   * @param {number} increment - The index increment.
   * @returns {string} {@link JOBTYPE}.SINGLE if the check fails, {@link
      * JOBTYPE}.ARRAY
   * otherwise.
   */
  checkArrayParams(start, end, increment) {
    return (!Number.isInteger(start) || !Number.isInteger(end) ||
            !Number.isInteger(increment) || start <= 0 ||
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
      fs.readFile(this.localListPath_, (error, data) => {
        if (error) {
          Logger.info(
              'Error while reading local lists file ' + this.localListPath_ +
              '.');
        } else {
          let localList = JSON.parse(data);
          if (localList.hasOwnProperty('whitelist')) {
            this.whitelist_ = localList.whitelist;
          }
          if (localList.hasOwnProperty('blacklist')) {
            this.blacklist_ = localList.blacklist;
          }
          // Removes duplicates.
          this.whitelist_ = Array.from(new Set(this.whitelist_));
          this.blacklist_ = Array.from(new Set(this.blacklist_));
        }
      });
    }

    if (this.globalListPath_ !== '') {
      fs.readFile(this.globalListPath_, (error, data) => {
        if (error) {
          Logger.info(
              'Error while reading local lists file ' + this.globalListPath_ +
              '.');
        } else {
          let globalList = JSON.parse(data);
          if (globalList.hasOwnProperty('whitelist')) {
            // Joins the global whitelist with the local one, removing
            // duplicates.
            this.whitelist_ = Array.from(
                new Set(this.whitelist_.concat(globalList.whitelist)));
          }
          if (globalList.hasOwnProperty('blacklist')) {
            // Joins the global blacklist with the local one, removing
            // duplicates.
            this.blacklist_ = Array.from(
                new Set(this.blacklist_.concat(globalList.blacklist)));
          }
        }
      });
    }
  }

  /**
   * Attempts to read the input file and update the input parameters.<br>
   * Time related parameters are multiplied by 1000 in order to convert seconds
   * to milliseconds.
   */
  updateInputParameters() {
    fs.readFile(this.inputFile_, (error, data) => {
      if (error) {
        Logger.info(
            'Error while reading input file ' + this.inputFile_ +
            '. using default parameters.');
      } else {
        Logger.info('Successfully read input file ' + this.inputFile_ + '.');
        this.inputParams_ = JSON.parse(data);
      }

      /** Max number of requests per user per time unit ([requestLifespan]{@link
          * scheduler/SchedulerManager#requestLifespan_}) for a single users.
       * @type {number}
       * @default 2
       * @private
       */
      this.maxRequestsPerSecUser_ =
          this.inputParams_.maxRequestsPerSecUser || 2;
      /** Max number of requests per user per time unit ([requestLifespan]{@link
          * scheduler/SchedulerManager#requestLifespan_}) for all users.
       * @type {number}
       * @default 4
       * @private
       */
      this.maxRequestsPerSecGlobal_ =
          this.inputParams_.maxRequestsPerSecGlobal || 4;
      /** Maximum time (in ms) allowed to pass after the most recent request
       * of a user before the user is removed from history.
       * @type {number}
       * @default 100000
       * @private
       */
      this.userLifespan_ = this.inputParams_.userLifespan * 1000 || 1000000;
      /** Time (in ms) after which a request can be removed from history.
       * @type {number}
       * @default 5000
       * @private
       */
      this.requestLifespan_ = this.inputParams_.requestLifespan * 1000 || 5000;
      /** Maximum number of concurrent jobs (either RUNNING, QUEUED,
       * ON_HOLD...).
       * @type {number}
       * @default 1
       * @private
       */
      this.maxConcurrentJobs_ = this.inputParams_.maxConcurrentJobs || 1;
      /** Time (in ms) after which a RUNNING job can be forcibly stopped.
       * @type {number}
       * @default 10000
       * @private
       */
      this.maxJobRunningTime_ =
          this.inputParams_.maxJobRunningTime * 1000 || 10000;
      /** Time (in ms) after which a QUEUED job can be forcibly stopped.
       * @type {number}
       * @default 10000
       */
      this.maxJobQueuedTime_ =
          this.inputParams_.maxJobQueuedTime * 1000 || 10000;
      /** Time (in ms) after which an array job whose first task is RUNNING can
       * be forcibly stopped.
       * @type {number}
       * @default 10000
       */
      this.maxArrayJobRunningTime_ =
          this.inputParams_.maxArrayJobRunningTime * 1000 || 10000;
      /** Time (in ms) after which an array job whose first task is QUEUED can
       * be forcibly stopped.
       * @type {number}
       * @default 10000
       */
      this.maxArrayJobQueuedTime_ =
          this.inputParams_.maxArrayJobQueuedTime * 1000 || 10000;
      /** Path of the local black/whitelist file.
       * @type {string}
       * @default ''
       */
      this.localListPath_ = this.inputParams_.localListPath || '';
      /** Path of the global black/whitelist file.
       * @type {string}
       * @default ''
       * @private
       */
      this.globalListPath_ = this.inputParams_.globalListPath || '';
      /** Minimum time (in ms) between two consecutive input file reads.
       * @type {number}
       * @default 5000
       * @private
       */
      this.minimumInputUpdateInterval_ =
          this.inputParams_.minimumInputUpdateInterval * 1000 || 10000;
      /** Time (in ms) of the last input file read.
       * @type {number}
       * @default 0
       * @private
       */
      this.lastInputFileUpdate_ = new Date().getTime();

      /** Time (in ms) interval between two consecutive job history polls.
       * @type {number}
       * @default 1000
       * @private
       */
      this.jobPollingInterval_ =
          this.inputParams_.jobPollingInterval * 1000 || 1000;
      /** Time (in ms) interval between two consecutive user history polls.
       * @type {number}
       * @default 1000
       */
      this.userPollingInterval_ =
          this.inputParams_.userPollingInterval * 1000 || 1000;
      /** Time (in ms) interval between two consecutive black/whitelist file
       * reads.
       * @type {number}
       * @default 1000
       * @private
       */
      this.listPollingInterval_ =
          this.inputParams_.listPollingInterval * 1000 || 1000;
      this.updateMonitors();
    });
  }
}

export const Sec = new SchedulerManager('./input_files/input.json');
