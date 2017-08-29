'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _database = require('./database');

var _database2 = _interopRequireDefault(_database);

var _logger = require('./logger');

var _logger2 = _interopRequireDefault(_logger);

var _promisedIo = require('promised-io');

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _JobTemplate = require('./nDrmaa/JobTemplate');

var _JobTemplate2 = _interopRequireDefault(_JobTemplate);

var _SessionManager = require('./nDrmaa/sge/SessionManager');

var _SessionManager2 = _interopRequireDefault(_SessionManager);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// Creates a Drmaa session.
var sm = new _SessionManager2.default();
sm.createSession("testSession");

/**
 * Class that manages clients' requests to submit a job to the Sun Grid Engine (SGE).
 * Job submission and handling is bound by the following constraints:
 *  - maximum number of requests per user per time unit
 *  - maximum number of requests per time unit for all users
 *  - blacklisted and whitelisted users
 *  - maximum allotted runtime, after which the job is forcibly terminated
 */

var SchedulerSecurity = function () {
  function SchedulerSecurity(inputFile) {
    _classCallCheck(this, SchedulerSecurity);

    this._jobs = []; // Jobs list.
    this._users = []; // Users list.
    this._globalReqs = []; // Recent requests by all users.
    try {
      var inputParams = JSON.parse(_fs2.default.readFileSync(inputFile, 'utf8'));
      console.log("Successfully read input file " + inputFile);

      this._maxReqPerSecUser = inputParams.maxReqPerSecUser; // Max number of requests per user per time unit (requestLifespan).
      this._maxReqPerSecGlobal = inputParams.maxReqPerSecGlobal; // Max number of requests per time unit for all users.
      this._blockingTimeUser = inputParams.blockingTimeUser; // Not used yet. Might not be needed.
      this._blockingTimeGlobal = inputParams.blockingTimeGlobal; // Not used yet. Might not be needed.
      this._requestLifespan = inputParams.requestLifespan; // Time after which a request can be removed from history.
      this._maxConcurrentJobs = inputParams.maxConcurrentJobs; // Not used yet. Might not be needed.
      this._maxJobRuntime = inputParams.maxJobRuntime; // Time after which a job execution can be forcibly stopped.
      this._blacklist = inputParams.blacklist; // Requests from blacklisted users are always rejected.
      this._whitelist = inputParams.whitelist; // Requests from whitelisted users are always accepted.
    } catch (err) {
      console.log("Error while reading input file " + inputFile + ". Using default parameters.");

      this._maxReqPerSecUser = 2; // Max number of requests per user per time unit (requestLifespan).
      this._maxReqPerSecGlobal = 4; // Max number of requests per time unit for all users.
      this._blockingTimeUser = 2000; // Not used yet. Might not be needed.
      this._blockingTimeGlobal = 6000; // Not used yet. Might not be needed.
      this._requestLifespan = 5000; // Time after which a request can be removed from history.
      this._maxConcurrentJobs = 1; // // Not used yet. Might not be needed.
      this._maxJobRuntime = 10000; // Time after which a job execution can be forcibly stopped.
      this._blacklist = []; // Requests from blacklisted users are always rejected.
      this._whitelist = []; // Requests from whitelisted users are always accepted.
    }

    // Polls the job history once per second.
    setInterval(this.pollJobs.bind(this), 1000);
  }

  /**
   * Handles a job submission request by a user. If no constraints are violated, the request is accepted and forwarded
   * to the SGE.
   *
   * @param requestData: object holding request information.
   */


  _createClass(SchedulerSecurity, [{
    key: 'handleRequest',
    value: function handleRequest(requestData) {
      var userIndex = this.findUserIndex(this._users, requestData);
      _logger2.default.info("Request received by " + requestData.ip + " at " + new Date(requestData.time).toUTCString());
      if (userIndex === -1) {
        //User is submitting a request for the first time.
        // Proceeds only if the max number of requests per time unit by all users has not been exceeded.
        if (this.isWhitelisted(requestData) || !this.isBlacklisted(requestData) && this.checkGlobalRequests(requestData)) {
          console.log("Creating user " + requestData.ip);
          // The new user is added to the user list along with the request timestamp.
          this._users.push({
            ip: requestData.ip,
            requests: [requestData.time],
            reqQty: 1
          });
          // The new request is added to the global requests list.
          this._globalReqs.push(requestData.time);
          console.log("New user ip: " + this._users[0].ip + ", user time: " + this._users[0].requests[0] + ", user qty: " + this._users[0].reqQty);
          _logger2.default.info("Request accepted");
          // Logs the request to database.
          this.registerRequestToDatabase(requestData);
          // Attempts to submit the job to the SGE.
          this.handleJobSubmission(requestData);
        }
      } else {
        // User has already submitted one or more requests in the past.
        console.log("User found");
        // Proceeds only if the max number of requests per time unit for all users AND for this user have not been
        // exceeded.
        if (this.verifyRequest(requestData)) {
          // The request is added to the user's request history.
          this._users[userIndex].requests.push(requestData.time);
          this._users[userIndex].reqQty++;
          this._globalReqs.push(requestData.time);
          console.log("Existing user ip: " + this._users[0].ip + ", user time: " + this._users[0].requests[this._users[0].requests.length - 1] + ", user qty: " + this._users[0].reqQty);
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

  }, {
    key: 'verifyRequest',
    value: function verifyRequest(requestData) {
      if (!this.checkUserRequests(requestData, this._users[this.findUserIndex(this._users, requestData)])) {
        _logger2.default.info("Request denied");
        console.log("Request denied.");
        return false;
      }
      _logger2.default.info("Request accepted");
      console.log("Request accepted.");
      return true;
    }

    /**
     * Verifies whether any request-per-time-unit constraints would be violated by the input request.
     *
     * @param requestData: object holding request information.
     * @param user: the user which submitted the request.
     * @returns {boolean} true if no constraints are violated.
     */

  }, {
    key: 'checkUserRequests',
    value: function checkUserRequests(requestData, user) {
      // If the user is blacklisted, the request is accepted.
      if (this.isWhitelisted(requestData)) return true;

      // If the user is blacklisted, the request is rejected.
      if (this.isBlacklisted(requestData)) return false;

      // If the server is already at capacity, additional requests cannot be serviced.
      if (!this.checkGlobalRequests(requestData)) return false;

      // If the user's request history is not full, the request can be serviced.
      if (user.reqQty < this._maxReqPerSecUser) return true;

      // If there are expired user requests, they are pruned and the current request can be serviced.
      for (var i = user.requests.length - 1; i >= 0; i--) {
        if (requestData.time - user.requests[i] > this._requestLifespan) {
          user.requests.splice(0, i + 1);
          user.reqQty -= i + 1;
          console.log("Removed " + (i + 1) + " request(s) from user " + user.ip + " request history. " + "There are currently " + user.requests.length + " request(s) in the user's history.");
          return true;
        }
      }

      // If no user requests were pruned, the user is already at capacity. Additional requests cannot be serviced.
      console.log("User " + user.ip + " cannot submit more requests right now. " + "There are currently " + user.requests.length + " request(s) in the user's history.");
      return false;
    }

    /**
     * Verifies whether the global request-per-time-unit constraint would be violated by the input request.
     *
     * @param requestData: object holding request information.
     * @returns {boolean} true if no constraints are violated.
     */

  }, {
    key: 'checkGlobalRequests',
    value: function checkGlobalRequests(requestData) {
      // Pruning of expired global requests, if any.
      console.log("_globalReqs.length: " + this._globalReqs.length);
      for (var i = this._globalReqs.length - 1; i >= 0; i--) {
        if (requestData.time - this._globalReqs[i] > this._requestLifespan) {
          this._globalReqs.splice(0, i + 1);
          console.log("Removed " + (i + 1) + " request(s) from global request history. " + "There are currently " + this._globalReqs.length + " global request(s).");
          break;
        }
      }

      // If the server is already at capacity, additional requests cannot be serviced.
      if (this._globalReqs.length >= this._maxReqPerSecGlobal) {
        console.log("_globalReqs.length: " + this._globalReqs.length + ". Cannot service more requests.");
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

  }, {
    key: 'isBlacklisted',
    value: function isBlacklisted(requestData) {
      if (this.findUserIndex(this._blacklist, requestData) !== -1) {
        console.log("User " + requestData.ip + " is blacklisted.");
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

  }, {
    key: 'isWhitelisted',
    value: function isWhitelisted(requestData) {
      if (this.findUserIndex(this._whitelist, requestData) !== -1) {
        console.log("User " + requestData.ip + " is whitelisted.");
        return true;
      }
      return false;
    }

    /**
     * Logs a request (ip and timestamp) to database.
     *
     * @param requestData: object holding request information.
     */

  }, {
    key: 'registerRequestToDatabase',
    value: function registerRequestToDatabase(requestData) {
      _logger2.default.info("Logging request to database.");
      _database2.default.performInsertOne(requestData, "test");
    }

    /**
     * Returns the index of the element of the array corresponding to the user who submitted the input request.
     *
     * @param userArray: the array the user who submitted the request belongs to.
     * @param requestData: object holding request information.
     * @returns {number} the index of the element corresponding to the user who submitted the request.
     *    Returns -1 if the user is not found.
     */

  }, {
    key: 'findUserIndex',
    value: function findUserIndex(userArray, requestData) {
      return userArray.findIndex(function (elem) {
        return elem.ip === requestData.ip;
      });
    }

    /**
     * Submits a job to the SGE.
     *
     * @param requestData: object holding request information.
     */

  }, {
    key: 'handleJobSubmission',
    value: function handleJobSubmission(requestData) {
      var _this = this;

      /*var jobData = new JobTemplate({
        remoteCommand: '/home/marco/Uni/Tesi/Projects/node-ws-template/sge-tests/simple.sh',
        workingDirectory: '/home/marco/Uni/Tesi/Projects/node-ws-template/sge-tests/',
        jobName: 'testJob',
        // submitAsHold: true
        nativeSpecification: '-now y'
      });*/
      try {
        // Loads job specifications from file.
        var jobInfo = JSON.parse(_fs2.default.readFileSync(requestData.jobPath, 'utf8'));
        var jobData = new _JobTemplate2.default({
          remoteCommand: jobInfo.remoteCommand,
          workingDirectory: jobInfo.workingDirectory,
          jobName: jobInfo.jobName,
          nativeSpecification: jobInfo.nativeSpecification
        });

        // Submits the job to the SGE.
        (0, _promisedIo.when)(sm.getSession('testSession'), function (session) {
          (0, _promisedIo.when)(session.runJob(jobData), function (jobId) {
            console.log('Job ' + jobId + ' submitted.');
            // Fetches the date and time of submission of the job.
            (0, _promisedIo.when)(session.getJobProgramSubmitDate(jobId), function (jobSubmitDate) {
              // Formats the date and time to an ISO-compliant format.
              jobSubmitDate = jobSubmitDate.split(' ').join('T').split('/').join('-') + "+02:00";
              var date = new Date(jobSubmitDate.substr(6, 4) + '-' + jobSubmitDate.substr(0, 5) + jobSubmitDate.substr(10, 15));
              // Adds the job to the job history.
              _this._jobs.push({
                jobId: jobId,
                user: requestData.ip,
                submitDate: date.getTime()
              });
            });
          });
        });
      } catch (err) {
        console.log("Error reading job file. Job not submitted to the SGE.");
      }
    }

    /**
     * Periodically queries the SGE to monitor the status of submitted jobs. Jobs which have exceeded their maximum
     *  runtime and are still running are terminated and removed from history. Jobs which terminated in the allotted time
     *  are removed from history.
     */

  }, {
    key: 'pollJobs',
    value: function pollJobs() {
      var _this2 = this;

      // There are no jobs in the job history.
      if (this._jobs.length === 0) return;

      (0, _promisedIo.when)(sm.getSession('testSession'), function (session) {
        var _loop = function _loop(i) {
          (0, _promisedIo.when)(session.getJobProgramStatus(_this2._jobs[i].jobId), function (jobStatus) {
            console.log("JOBTIME for JOB " + _this2._jobs[i].jobId + " equal to " + (new Date().getTime() - _this2._jobs[i].submitDate));
            // Terminates and removes from history jobs which are still running after the maximum allotted runtime.
            if (jobStatus !== 'FAILED' && jobStatus !== 'DONE' && new Date().getTime() - _this2._jobs[i].submitDate > _this2._maxJobRuntime) {
              console.log("Job " + _this2._jobs[i].jobId + " has exceeded maximum runtime. Terminating.");
              (0, _promisedIo.when)(session.control(_this2._jobs[i].jobId, session.TERMINATE), function (resp) {
                console.log("Removing job " + _this2._jobs[i].jobId + " from job history.");
                _this2._jobs.splice(i, 1);
              });
            }
            // Jobs whose execution ended within the maximum allotted runtime are removed from history.
            else if (jobStatus === 'FAILED' || jobStatus === 'DONE') {
                console.log("Job " + _this2._jobs[i].jobId + " already terminated execution.");
                console.log("Removing job " + _this2._jobs[i].jobId + " from job history.");
                _this2._jobs.splice(i, 1);
              }
          });
        };

        // Checks the status of each job in the job history.
        for (var i = _this2._jobs.length - 1; i >= 0; i--) {
          _loop(i);
        }
      });
    }
  }]);

  return SchedulerSecurity;
}();

exports.default = new SchedulerSecurity('input.json');