import Db from '../database';
import Logger from '../logger';

import {when, defer} from 'promised-io';
import fs from 'fs';
import JobTemplate from '../nDrmaa/JobTemplate';
import SessionManager from '../nDrmaa/sge/SessionManager';
import * as sgeClient from '../nDrmaa/sge/sge-cli';
import * as monitors from './monitors';


export const JOBTYPE = {
  SINGLE: 'SINGLE',
  ARRAY: 'ARRAY'
};

// Creates a Drmaa session.
export const sessionManager = new SessionManager();
sessionManager.createSession('testSession');

/**
 * Class that manages clients' requests to submit a job to the Sun Grid Engine
 * (SGE).
 * Job submission and handling is bound by the following constraints:
 *  - maximum number of requests per user per time unit
 *  - maximum number of requests per time unit for all users
 *  - blacklisted and whitelisted users
 *  - maximum allotted runtime, after which the job is forcibly terminated
 * These constraints are configured in the input.json file, to be placed in the
 * root of the project directory (temporary arrangement).
 */
class SchedulerSecurity {
  constructor(inputFile) {
    this.inputFile_ = inputFile;
    this.jobs_ = [];            // Jobs list.
    this.users_ = [];           // Users list.
    this.globalRequests_ = [];  // Recent requests by all users.
    this.blacklist_ = [];       // Requests from blacklisted users are rejected.
    this.whitelist_ = [];       // Requests from blacklisted users are rejected.
    this.lastInputFileUpdate_ = 0;
    this.inputParams_ = {
      maxRequestsPerSecUser: 2,
      maxRequestsPerSecGlobal: 4,
      userLifespan: 1000000,
      requestLifespan: 5000,
      maxConcurrentJobs: 1,
      maxJobRunningTime: 10000,
      maxJobQueuedTime: 10000,
      maxArrayJobRunningTime: 10000,
      maxArrayJobQueuedTime: 10000,
      minimumTimeBetweenFileUpdates: 5000,
      lastInputFileUpdate: 0,
      localListPath: '',
      globalListPath: '',
      jobPollingInterval: 1000,
      userPollingInterval: 1000,
      listUpdateInterval: 1000,
    };

    // Sets input parameters as specified in the input file. If there is an
    // error
    // reading the input file, default parameters are set.
    this.updateInputParameters();
    // Checks if there are any users to be added to the black/whitelist.
    this.updateLists();

    // Polls the job history as often as specified.
    setInterval(monitors.pollJobs.bind(this), this.jobPollingInterval_);
    // Polls the job history as often as specified.
    setInterval(monitors.pollUsers.bind(this), this.userPollingInterval_);
    // Updates the input parameters as often as specified.
    // setInterval(this.updateInputParameters.bind(this, inputFile), 1000);
    // Updates the black/whitelists as often as specified.
    setInterval(this.updateLists.bind(this), this.listUpdateInterval_);

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
            console.log('blacklisted user ' + user);
          }
          console.log('\n');
        }, 5000);*/
  }

  /**
   * Handles a job submission request by a user. If no constraints are violated,
   * the request is accepted and forwarded
   * to the SGE.
   *
   * @param requestData: object holding request information.
   */
  handleRequest(requestData) {
    requestData.ip = requestData.ip.replace(/^.*:/, '');
    let userIndex = this.findUserIndex(this.users_, requestData);
    Logger.info(
        'Request received by ' + requestData.ip + ' at ' +
        new Date(requestData.time).toUTCString() + '.');

    if (new Date().getTime() - this.lastInputFileUpdate_ >
        this.minimumTimeBetweenFileUpdates_) {
      this.updateInputParameters();
    }

    if (userIndex === -1) {  // User is submitting a request for the first time.
      // Proceeds only if the max number of requests per time unit by all users
      // has not been exceeded.
      if (this.isWhitelisted(requestData) ||
          (!this.isBlacklisted(requestData) &&
           this.checkGlobalRequests(requestData))) {
        Logger.info('Creating user ' + requestData.ip + '.');
        // The new user is added to the user list along with the request
        // timestamp.
        this.users_.push({
          ip: requestData.ip,
          requests: [requestData.time],
          requestAmount: 1,
        });
        // The new request is added to the global requests list.
        this.globalRequests_.push(requestData.time);
        Logger.info('Request accepted.');
        // Logs the request to database.
        this.registerRequestToDatabase(requestData);
        // Attempts to submit the job to the SGE.
        this.handleJobSubmission(requestData);

      } else {
        Logger.info('Request denied.');
      }
    } else {  // User has already submitted one or more requests in the past.
      Logger.info('User ' + requestData.ip + ' found.');
      // Proceeds only if the max number of requests per time unit for all users
      // AND for this user have not been exceeded.
      if (this.verifyRequest(requestData)) {
        // The request is added to the user's request history.
        this.users_[userIndex].requests.push(requestData.time);
        this.users_[userIndex].requestAmount++;
        this.globalRequests_.push(requestData.time);
        this.registerRequestToDatabase(requestData);
        this.handleJobSubmission(requestData);
      }
    }
  }

  /**
   * Returns true if the request can be serviced.
   *
   * @param requestData: object holding request information.
   * @returns {boolean} true if the request is accepted.
   */
  verifyRequest(requestData) {
    if (!this.checkUserRequests(
            requestData,
            this.users_[this.findUserIndex(this.users_, requestData)])) {
      Logger.info('Request denied.');
      return false;
    }
    Logger.info('Request accepted.');
    return true;
  }

  /**
   * Verifies whether any request-per-time-unit constraints would be violated by
   * the input request.
   *
   * @param requestData: object holding request information.
   * @param user: the user which submitted the request.
   * @returns {boolean} true if no constraints are violated.
   */
  checkUserRequests(requestData, user) {
    // If the user is whitelisted, the request is accepted.
    if (this.isWhitelisted(requestData)) return true;

    // If the user is blacklisted, the request is rejected.
    if (this.isBlacklisted(requestData)) return false;

    // If the server is already at capacity, additional requests cannot be
    // serviced.
    if (!this.checkGlobalRequests(requestData)) return false;

    // If the user's request history is not full, the request can be serviced.
    if (user.requestAmount < this.maxRequestsPerSecUser_) return true;

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
        return true;
      }
    }

    // If no user requests were pruned, the user is already at capacity.
    // Additional requests cannot be serviced.
    Logger.info(
        'User ' + user.ip +
        ' cannot submit more requests right now: there are currently ' +
        user.requests.length + ' request(s) in the user\'s history.');
    return false;
  }

  /**
   * Verifies whether the global request-per-time-unit constraint would be
   * violated by the input request.
   *
   * @param requestData: object holding request information.
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
   * @param requestData: object holding request information.
   * @returns {boolean} true if the user is blacklisted.
   */
  isBlacklisted(requestData) {
    if (this.blacklist_.findIndex((elem) => { return elem === '*'; }) !== -1 ||
        this.blacklist_.findIndex(
            (elem) => { return elem === requestData.ip; }) !== -1) {
      Logger.info('User ' + requestData.ip + ' is blacklisted.');
      return true;
    }
    return false;
  }

  /**
   * Checks if the user is whitelisted.
   *
   * @param requestData: object holding request information.
   * @returns {boolean} true if the user is whitelisted.
   */
  isWhitelisted(requestData) {
    if (this.whitelist_.findIndex((elem) => { return elem === '*'; }) !== -1 ||
        this.whitelist_.findIndex(
            (elem) => { return elem === requestData.ip; }) !== -1) {
      Logger.info('User ' + requestData.ip + ' is whitelisted.');
      return true;
    }
    return false;
  }

  /**
   * Logs a request (ip and timestamp) to database.
   *
   * @param requestData: object holding request information.
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
   * @param requestData: object holding request information.
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
            increment > end || increment < start) ?
        JOBTYPE.SINGLE :
        JOBTYPE.ARRAY;
  }

  /**
   * Attempts to read the local and global black/whitelist files and updates the
   * arrays of the blacklisted and whitelisted users.
   */
  updateLists() {
    if (this.localListPath_ !== '') {
      try {
        let localList =
            JSON.parse(fs.readFileSync(this.localListPath_, 'utf8'));
        if (localList.hasOwnProperty('whitelist'))
          this.whitelist_ = localList.whitelist;
        if (localList.hasOwnProperty('whitelist'))
          this.blacklist_ = localList.blacklist;
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
          this.whitelist_ =
              Array.from(new Set(this.whitelist_.concat(globalList.whitelist)));
        }
        if (globalList.hasOwnProperty('blacklist')) {
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

  updateInputParameters() {
    try {
      this.inputParams_ = JSON.parse(fs.readFileSync(this.inputFile_, 'utf8'));
      Logger.info('Successfully read input file ' + this.inputFile_ + '.');
    } catch (err) {
      Logger.info(
          'Error while reading input file ' + this.inputFile_ +
          '. Using default parameters.');
    }

    // Max number of requests per user per time unit (requestLifespan).
    this.maxRequestsPerSecUser_ = this.inputParams_.maxRequestsPerSecUser || 2;
    // Max number of requests per time unit for all users.
    this.maxRequestsPerSecGlobal_ =
        this.inputParams_.maxRequestsPerSecGlobal || 4;
    // Maximum time allowed to pass after the most recent request of a user
    // before the user is removed from history.
    this.userLifespan_ = this.inputParams_.userLifespan || 1000000;
    // Time after which a request can be removed from history.
    this.requestLifespan_ = this.inputParams_.requestLifespan || 5000;

    // Not used yet. Might not be needed.
    this.maxConcurrentJobs_ = this.inputParams_.maxConcurrentJobs || 1;
    // Time after which a RUNNING job can be forcibly stopped.
    this.maxJobRunningTime_ = this.inputParams_.maxJobRunningTime || 10000;
    // Time after which a QUEUED job can be forcibly stopped.
    this.maxJobQueuedTime_ = this.inputParams_.maxJobQueuedTime || 10000;
    // Time after which an array job whose first task is RUNNING can be forcibly
    // stopped.
    this.maxArrayJobRunningTime_ =
        this.inputParams_.maxArrayJobRunningTime || 10000;
    // Time after which an array job whose first task is QUEUED can be forcibly
    // stopped.
    this.maxArrayJobQueuedTime_ =
        this.inputParams_.maxArrayJobQueuedTime || 10000;

    // Path of the local black/whitelist file.
    this.localListPath_ = this.inputParams_.localListPath || '';
    // Path of the global black/whitelist file.
    this.globalListPath_ = this.inputParams_.globalListPath || '';

    this.minimumTimeBetweenFileUpdates_ =
        this.inputParams_.minimumTimeBetweenFileUpdates || 10000;
    this.lastInputFileUpdate_ = new Date().getTime();

    this.jobPollingInterval_ = this.inputParams_.jobPollingInterval || 1000;
    this.userPollingInterval_ = this.inputParams_.userPollingInterval || 1000;
    this.listUpdateInterval_ = this.inputParams_.listUpdateInterval || 1000;
  }

  /**
   * Submits a job to the SGE.
   *
   * @param requestData: object holding request information.
   */
  handleJobSubmission(requestData) {
    if (this.jobs_.length >= this.maxConcurrentJobs_) {
      Logger.info(
          'Server is working at capacity. Cannot submit any more jobs at the moment.');
      return;
    }
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

      let start = jobInfo.start || null;
      let end = jobInfo.end || null;
      let increment = jobInfo.incr || null;

      // Determines if the job consists of a single task or multiple ones.
      let jobType = this.checkArrayParams(start, end, increment);
      console.log('jobType: ' + jobType);

      // Submits the job to the SGE.
      when(sessionManager.getSession('testSession'), (session) => {
        when(
            jobType === JOBTYPE.SINGLE ?
                session.runJob(jobData) :
                session.runBulkJobs(jobData, start, end, increment),
            (jobId) => {
              // Fetches the date and time of submission of the job.
              when(session.getJobProgramStatus([jobId]), (jobStatus) => {
                when(sgeClient.qstat(jobId), (job) => {
                  // Converts the date to an ms-from-epoch format.
                  let jobSubmitDate = new Date(job.submission_time).getTime();
                  let taskStatuses = [];
                  let taskRunningTime = [];
                  let taskInfo = [];
                  if (jobType === JOBTYPE.ARRAY) {
                    for (let taskId = start; taskId <= end;
                         taskId += increment) {
                      console.log(
                          'task ' + taskId + ' status: ' +
                          jobStatus[jobId][taskId].mainStatus);
                      /*taskStatuses.push({
                        taskId: taskId,
                        status: jobStatus[jobId][taskId].mainStatus,
                      });
                      taskRunningTime.push({
                        taskId: taskId,
                        runningTime: 0,
                        runningStart: 0,
                      });*/
                      taskInfo.push({
                        taskId: taskId,
                        status: jobStatus[jobId][taskId].mainStatus,
                        runningTime: 0,
                        runningStart: 0,
                      })
                    }
                  }
                  // Adds the job to the job history.
                  this.jobs_.push({
                    jobId: jobId,
                    jobName: job.job_name,
                    jobStatus: jobStatus[jobId].mainStatus,
                    firstTaskId: jobType === JOBTYPE.SINGLE ? null : start,
                    lastTaskId: jobType === JOBTYPE.SINGLE ? null : end,
                    increment: jobType === JOBTYPE.SINGLE ? null : increment,
                    taskInfo: taskInfo,
                    startedAsRunning: false,
                    user: requestData.ip,
                    submitDate: jobSubmitDate,
                    totalExecutionTime: 0,
                    jobType: jobType,
                  });
                  // console.log('jobstatus ' + jobStatus.mainStatus);
                  // console.log('submitdate ' + new
                  Logger.info(
                      'Added job ' + jobId + ' (' + job.job_name + ') on ' +
                      new Date(jobSubmitDate).toUTCString());
                  Logger.info(
                      'Added job ' + jobId + ' (' + job.job_name +
                      ') to job history. Current job history size: ' +
                      this.jobs_.length + '.');
                });
              });
            },
            () => {
              Logger.info(
                  'Error found in job specifications. Job not submitted to the SGE.');
            });
      });
    } catch (err) {
      Logger.info(
          'Error reading job specifications from file. Job not submitted to the SGE.');
    }
  }
}

export const Sec = new SchedulerSecurity('./input_files/input.json');
