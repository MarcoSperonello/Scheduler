import Db from './database';
import Logger from './logger';

import {when,defer} from "promised-io";
import JobTemplate from "./nDrmaa/JobTemplate";
import SessionManager from "./nDrmaa/sge/SessionManager";

const pathModule = require("path");
const fs = require('fs');

const sm = new SessionManager();
sm.createSession("testSession");

class SchedulerSecurity {
  constructor(inputFile) {
    this._jobs = [];    // Jobs list.
    this._users = [];   // Users list.
    this._globalReqs = [];  // Recent requests by all users.
    try {
      let inputParams = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
      console.log("Successfully read input file " + inputFile);

      this._maxReqPerSecUser = inputParams.maxReqPerSecUser;  // Max number of requests per user per time unit.
      this._maxReqPerSecGlobal = inputParams.maxReqPerSecGlobal;   // Max number of requests per time unit for all users.
      this._blockingTimeUser = inputParams.blockingTimeUser;  // Not used yet. Might not be needed.
      this._blockingTimeGlobal = inputParams.blockingTimeGlobal;  // Not used yet. Might not be needed.
      this._requestLifespan = inputParams.requestLifespan;  // Time after which a request can be removed from history.
      this._maxConcurrentJobs = inputParams.maxConcurrentJobs; // Max number of concurrent jobs.
      this._maxJobRuntime = inputParams.maxJobRuntime; // Time after which a job execution can be forcibly stopped.
      this._blacklist = inputParams.blacklist; // Requests from blacklisted users are always rejected.
      this._whitelist = inputParams.whitelist; // Requests from whitelisted users are always accepted.

    } catch(err) {
      console.log("Error while reading input file " + inputFile + ". Using default parameters.");

      this._maxReqPerSecUser = 2;  // Max number of requests per user per time unit.
      this._maxReqPerSecGlobal = 4;   // Max number of requests per time unit for all users.
      this._blockingTimeUser = 2000;  // Not used yet. Might not be needed.
      this._blockingTimeGlobal = 6000;  // Not used yet. Might not be needed.
      this._requestLifespan = 5000;  // Time after which a request can be removed from history.
      this._maxConcurrentJobs = 1; // Max number of concurrent jobs.
      this._maxJobRuntime = 10000; // Time after which a job execution can be forcibly stopped.
      this._blacklist = []; // Requests from blacklisted users are always rejected.
      this._whitelist = []; // Requests from whitelisted users are always accepted.
    }

    setInterval(this.pollJobs.bind(this), 1000);
  }

  // Handles a job submission request by a user. If no constraints are violated, the request is accepted.
  handleRequest(requestData) {
    let userIndex = this.findUserIndex(this._users, requestData);
    console.log("userIndex " + userIndex);
    Logger.info("Request received by " + requestData.ip + " at " + new Date(requestData.time).toUTCString());
    if (userIndex === -1) { //User is submitting a request for the first time.
      // Proceeds only if the max number of requests per time unit by all users has not been exceeded.
      if (this.isWhitelisted(requestData) ||
          (!this.isBlacklisted(requestData) && this.checkGlobalRequests(requestData))) {
        console.log("Creating user.");
        // The new user is added to the user list along with the request timestamp.
        this._users.push({
          ip: requestData.ip,
          requests: [requestData.time],
          reqQty: 1
        });
        // The new request is added to the global requests list.
        this._globalReqs.push(requestData.time);
        console.log("New user ip: " + this._users[0].ip + ", user time: " + this._users[0].requests[0]
            +", user qty: " + this._users[0].reqQty);
        Logger.info("Request accepted");
        // Logs the request to database.
        this.registerRequestToDatabase(requestData);
        //TODO: AGGIUNGERE CHIAMATA JOB
        //this.handleJobSubmission(requestData)
      }
    } else { // User has already submitted one or more requests in the past.
      console.log("User found");
      // Proceeds only if the max number of requests per time unit for all users AND for this user have not been
      // exceeded.
      if (this.verifyRequest(requestData)) {
        // The request is added to the user's request history.
        this._users[userIndex].requests.push(requestData.time);
        this._users[userIndex].reqQty++;
        this._globalReqs.push(requestData.time);
        console.log("Existing user ip: " + this._users[0].ip + ", user time: "
            + this._users[0].requests[this._users[0].requests.length - 1] + ", user qty: "
            + this._users[0].reqQty);
        this.registerRequestToDatabase(requestData);
        //TODO: AGGIUNGERE CHIAMATA JOB
        //this.handleJobSubmission(requestData)
      }
    }
  }

  // Returns true if the request can be serviced.
  verifyRequest(requestData) {
    if (!this.checkUserRequests(requestData, this._users[this.findUserIndex(this._users, requestData)])) {
      Logger.info("Request denied");
      console.log("Request denied.");
      return false;
    }
    Logger.info("Request accepted");
    console.log("Request accepted.");
    return true;
  }

  // Verifies whether any request-per-time-unit constraints would be violated by the input request.
  // Returns true if no constraints are violated.
  checkUserRequests(requestData, user) {
    // If the user is blacklisted, the request is accepted.
    if (this.isWhitelisted(requestData)) return true;

    // If the user is blacklisted, the request is rejected.
    if (this.isBlacklisted(requestData)) return false;

    // If the server is already at capacity, additional requests cannot be serviced.
    if (!this.checkGlobalRequests(requestData)) return false;

    // If the user's request history is not full, the request can be serviced.
    if (user.reqQty < this._maxReqPerSecUser) return true;

    // If there are expired user requests, they are pruned and the current request can be serviced.
    for (let i = user.requests.length - 1; i >= 0; i--) {
      if (requestData.time - user.requests[i] > this._requestLifespan) {
        user.requests.splice(0, i + 1);
        user.reqQty -= (i + 1);
        console.log("Removed " + (i + 1) + " request(s) from user " + user.ip + " request history. "
            + "There are currently " + user.requests.length + " request(s) in the user's history.");
        return true;
      }
    }

    // If no user requests were pruned, the user is already at capacity. Additional requests cannot be serviced.
    console.log("User " + user.ip + " cannot submit more requests right now. " +
        "There are currently " + user.requests.length + " request(s) in the user's history.");
    return false;
  }

  // Verifies whether the global request-per-time-unit constraint would be violated by the input request.
  // Returns true if no constraints are violated.
  checkGlobalRequests(requestData) {
    // Pruning of expired global requests, if any.
    console.log("_globalReqs.length: " + this._globalReqs.length);
    for (let i = this._globalReqs.length - 1; i >= 0; i--) {
      if (requestData.time - this._globalReqs[i] > this._requestLifespan) {
        this._globalReqs.splice(0, i + 1);
        console.log("Removed " + (i + 1) + " request(s) from global request history. "
            + "There are currently " + this._globalReqs.length + " global request(s).");
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

  // Returns true if the user is blacklisted.
  isBlacklisted(requestData) {
    //if (this.findUserIndex(this._blacklist, requestData) !== -1) return true;
    //return false;
    if (this.findUserIndex(this._blacklist, requestData) !== -1) {
      console.log("User " + requestData.ip + " is blacklisted.");
      return true;
    }
    return false;
  }

  // Returns true if the user is whitelisted.
  isWhitelisted(requestData) {
    //if (this.findUserIndex(this._blacklist, requestData) !== -1) return true;
    //return false;
    if (this.findUserIndex(this._whitelist, requestData) !== -1) {
      console.log("User " + requestData.ip + " is whitelisted.");
      return true;
    }
    return false;
  }

  // Logs a request (ip and timestamp) to database.
  registerRequestToDatabase(requestData) {
    Logger.info("Logging request to database");
    Db.performInsertOne(requestData, "test");
  }

  // Returns the index of the _users array corresponding to the user who submitted the input requests.
  // Returns -1 if said user is not found.
  findUserIndex(userArray, requestData) {
    return userArray.findIndex((elem) => {
      return elem.ip === requestData.ip;
    });
  }

  handleJobSubmission(requestData) {
    var jobData = new JobTemplate({
      remoteCommand: '/home/marco/Uni/Tesi/Projects/node-ws-template/sge-tests/simple.sh',
      workingDirectory: '/home/marco/Uni/Tesi/Projects/node-ws-template/sge-tests/',
      jobName: 'testJob',
      // submitAsHold: true
      nativeSpecification: '-now y'
    });

    when(sm.getSession('testSession'), (session) => {
      when(session.runJob(jobData), (jobId) => {
        console.log('Job ' + jobId + ' submitted');
        when(session.getJobProgramSubmitDate(jobId), (jobSubmitDate) => {
          console.log('jobSubmitDate ' + jobSubmitDate);
          jobSubmitDate = jobSubmitDate.split(' ').join('T').split('/').join('-')+"+02:00";
          console.log("jobsubmitdate " + jobSubmitDate);
          let date = new Date(jobSubmitDate.substr(6,4) + '-' + jobSubmitDate.substr(0,5) + jobSubmitDate.substr(10,15));
          console.log("date" + date);
          this._jobs.push({
            jobId: jobId,
            user: requestData.ip,
            submitDate: date.getTime()
          });
        });
      });
    });
  }

  pollJobs() {
    if(this._jobs.length === 0) return;

    when(sm.getSession('testSession'), (session) => {
      for(let i = this._jobs.length - 1; i >= 0; i--) {
        when(session.getJobProgramStatus(this._jobs[i].jobId), (jobStatus) => {
          console.log("JOBTIME for JOB " + this._jobs[i].jobId + " equal to " + (new Date().getTime() - this._jobs[i].submitDate));

          if(jobStatus !== 'FAILED' && jobStatus !== 'DONE' && new Date().getTime() - this._jobs[i].submitDate > this._maxJobRuntime) {
            console.log("Job " + this._jobs[i].jobId + " has exceeded maximum runtime. Terminating.");
            when(session.control(this._jobs[i].jobId, session.TERMINATE), (resp) => {
              console.log("Removing job from job history...");
              this._jobs.splice(i,1);
            });
          } else if (jobStatus === 'FAILED' || jobStatus === 'DONE') {
            console.log("Job " + this._jobs[i].jobId + " already terminated execution.");
            console.log("Removing job from job history...");
            this._jobs.splice(i,1);
          }
        });
      }
    });
  }
}

export default new SchedulerSecurity('input.json');
