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
sm.createSession('testSession');

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

var SchedulerSecurity = function () {
  function SchedulerSecurity(inputFile) {
    _classCallCheck(this, SchedulerSecurity);

    this.jobs_ = []; // Jobs list.
    this.users_ = []; // Users list.
    this.globalRequests_ = []; // Recent requests by all users.
    try {
      var inputParams = JSON.parse(_fs2.default.readFileSync(inputFile, 'utf8'));
      _logger2.default.info('Successfully read input file ' + inputFile + '.');

      // Max number of requests per user per time unit (requestLifespan).
      this.maxRequestsPerSecUser_ = inputParams.maxRequestsPerSecUser;
      // Max number of requests per time unit for all users.
      this.maxRequestsPerSecGlobal_ = inputParams.maxRequestsPerSecGlobal;
      // Not used yet. Might not be needed.
      this.blockingTimeUser_ = inputParams.blockingTimeUser;
      // Not used yet. Might not be needed.
      this.blockingTimeGlobal_ = inputParams.blockingTimeGlobal;
      // Time after which a request can be removed from history.
      this.requestLifespan_ = inputParams.requestLifespan;

      // Not used yet. Might not be needed.
      this.maxConcurrentJobs_ = inputParams.maxConcurrentJobs;
      // Time after which a job execution can be forcibly stopped.
      this.maxJobRuntime_ = inputParams.maxJobRuntime;
      // Requests from blacklisted users are always rejected.
      this.blacklist_ = inputParams.blacklist;
      // Requests from whitelisted users are always accepted.
      this.whitelist_ = inputParams.whitelist;
    } catch (err) {
      _logger2.default.info('Error while reading input file ' + inputFile + '. Using default parameters.');

      this.maxRequestsPerSecUser_ = 2;
      this.maxRequestsPerSecGlobal_ = 4;
      this.blockingTimeUser_ = 2000;
      this.blockingTimeGlobal_ = 6000;
      this.requestLifespan_ = 5000;
      this.maxConcurrentJobs_ = 1;
      this.maxJobRuntime_ = 10000;
      this.blacklist_ = [];
      this.whitelist_ = [];
    }

    // Polls the job history once per second.
    setInterval(this.pollJobs.bind(this), 1000);
  }

  /**
   * Handles a job submission request by a user. If no constraints are violated,
   * the request is accepted and forwarded
   * to the SGE.
   *
   * @param requestData: object holding request information.
   */


  _createClass(SchedulerSecurity, [{
    key: 'handleRequest',
    value: function handleRequest(requestData) {
      var userIndex = this.findUserIndex(this.users_, requestData);
      _logger2.default.info('Request received by ' + requestData.ip + ' at ' + new Date(requestData.time).toUTCString() + '.');
      if (userIndex === -1) {
        // User is submitting a request for the first time.
        // Proceeds only if the max number of requests per time unit by all users
        // has not been exceeded.
        if (this.isWhitelisted(requestData) || !this.isBlacklisted(requestData) && this.checkGlobalRequests(requestData)) {
          _logger2.default.info('Creating user ' + requestData.ip + '.');
          // The new user is added to the user list along with the request
          // timestamp.
          this.users_.push({
            ip: requestData.ip,
            requests: [requestData.time],
            requestAmount: 1
          });
          // The new request is added to the global requests list.
          this.globalRequests_.push(requestData.time);
          _logger2.default.info('Request accepted.');
          // Logs the request to database.
          this.registerRequestToDatabase(requestData);
          // Attempts to submit the job to the SGE.
          this.handleJobSubmission(requestData);
        }
      } else {
        // User has already submitted one or more requests in the past.
        _logger2.default.info('User ' + requestData.ip + ' found.');
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

  }, {
    key: 'verifyRequest',
    value: function verifyRequest(requestData) {
      if (!this.checkUserRequests(requestData, this.users_[this.findUserIndex(this.users_, requestData)])) {
        _logger2.default.info('Request denied.');
        return false;
      }
      _logger2.default.info('Request accepted.');
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

  }, {
    key: 'checkUserRequests',
    value: function checkUserRequests(requestData, user) {
      // If the user is blacklisted, the request is accepted.
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
      for (var i = user.requests.length - 1; i >= 0; i--) {
        if (requestData.time - user.requests[i] > this.requestLifespan_) {
          user.requests.splice(0, i + 1);
          user.requestAmount -= i + 1;
          // console.log("Removed " + (i + 1) + " request(s) from user " + user.ip
          // + " request history. "
          //    + "There are currently " + user.requests.length + " request(s) in
          //    the user's history.");
          return true;
        }
      }

      // If no user requests were pruned, the user is already at capacity.
      // Additional requests cannot be serviced.
      // console.log("User " + user.ip + " cannot submit more requests right now.
      // " +
      //    "There are currently " + user.requests.length + " request(s) in the
      //    user's history.");
      return false;
    }

    /**
     * Verifies whether the global request-per-time-unit constraint would be
     * violated by the input request.
     *
     * @param requestData: object holding request information.
     * @returns {boolean} true if no constraints are violated.
     */

  }, {
    key: 'checkGlobalRequests',
    value: function checkGlobalRequests(requestData) {
      // Pruning of expired global requests, if any.
      // console.log("globalRequests_.length: " + this.globalRequests_.length);
      for (var i = this.globalRequests_.length - 1; i >= 0; i--) {
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
        _logger2.default.info('Server already at capacity. Cannot service more requests.');
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
      if (this.findUserIndex(this.blacklist_, requestData) !== -1) {
        _logger2.default.log('User ' + requestData.ip + ' is blacklisted.');
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
      if (this.findUserIndex(this.whitelist_, requestData) !== -1) {
        _logger2.default.log('User ' + requestData.ip + ' is whitelisted.');
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
      _logger2.default.info('Logging request to database.');
      _database2.default.performInsertOne(requestData, 'test');
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
            // Fetches the date and time of submission of the job.
            (0, _promisedIo.when)(session.getJobProgramSubmitDate(jobId), function (jobSubmitDate) {
              // Formats the date and time to an ISO-compliant format.
              jobSubmitDate = jobSubmitDate.split(' ').join('T').split('/').join('-') + '+02:00';
              var date = new Date(jobSubmitDate.substr(6, 4) + '-' + jobSubmitDate.substr(0, 5) + jobSubmitDate.substr(10, 15));
              // Adds the job to the job history.
              _this.jobs_.push({
                jobId: jobId,
                user: requestData.ip,
                submitDate: date.getTime()
              });
            });
          }, function () {
            _logger2.default.info('Error found in job specifications. Job not submitted to the SGE.');
          });
        });
      } catch (err) {
        _logger2.default.info('Error reading job specifications from file. Job not submitted to the SGE.');
      }
    }

    /**
     * Periodically queries the SGE to monitor the status of submitted jobs. Jobs
     * which have exceeded their maximum
     *  runtime and are still running are terminated and removed from history.
     * Jobs which terminated in the allotted time
     *  are removed from history.
     */

  }, {
    key: 'pollJobs',
    value: function pollJobs() {
      var _this2 = this;

      // There are no jobs in the job history.
      if (this.jobs_.length === 0) return;

      (0, _promisedIo.when)(sm.getSession('testSession'), function (session) {
        var _loop = function _loop(i) {
          (0, _promisedIo.when)(session.getJobProgramStatus(_this2.jobs_[i].jobId), function (jobStatus) {
            // console.log("JOBTIME for JOB " + this.jobs_[i].jobId + " equal
            // to " + (new Date().getTime() - this.jobs_[i].submitDate));
            // Terminates and removes from history jobs which are still
            // running after the maximum allotted runtime.
            if (jobStatus !== 'FAILED' && jobStatus !== 'DONE' && new Date().getTime() - _this2.jobs_[i].submitDate > _this2.maxJobRuntime_) {
              _logger2.default.info('Job ' + _this2.jobs_[i].jobId + ' has exceeded maximum runtime. Terminating.');
              (0, _promisedIo.when)(session.control(_this2.jobs_[i].jobId, session.TERMINATE), function (resp) {
                _logger2.default.info('Removing job ' + _this2.jobs_[i].jobId + ' from job history.');
                _this2.jobs_.splice(i, 1);
              });
            }
            // Jobs whose execution ended within the maximum allotted runtime
            // are removed from history.
            else if (jobStatus === 'FAILED' || jobStatus === 'DONE') {
                _logger2.default.info('Job ' + _this2.jobs_[i].jobId + ' already terminated execution.');
                _logger2.default.info('Removing job ' + _this2.jobs_[i].jobId + ' from job history.');
                _this2.jobs_.splice(i, 1);
              }
          }, function () {
            _logger2.default.info('Error reading status for job ' + _this2.jobs_[i].jobId + '.');
          });
        };

        // Checks the status of each job in the job history.
        for (var i = _this2.jobs_.length - 1; i >= 0; i--) {
          _loop(i);
        }
      });
    }
  }]);

  return SchedulerSecurity;
}();

exports.default = new SchedulerSecurity('input.json');