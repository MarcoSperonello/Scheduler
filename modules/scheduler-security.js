import Db from './database';
import Logger from './logger';

const pathModule = require("path");

class SchedulerSecurity {
    constructor(inputParams) {
        this._jobs = [];    // Jobs list.
        this._users = [];   // Users list.
        this._globalReqs = [];  // Recent requests by all users.
        this._maxReqPerSecUser = inputParams.maxReqPerSecUser;  // Max number of requests per user per time unit.
        this._maxReqPerSecGlobal = inputParams.maxReqPerSecGlobal;  // Max number of requests per time unit for all users.
        this._blockingTimeUser = inputParams.blockingTimeUser;  // Not used yet.
        this._blockingTimeGlobal = inputParams.blockingTimeGlobal;  // Not used yet.
        this._requestLifespan = inputParams.requestLifespan;  // Time after which a request can be removed from history.
        this._maxConcurrentJobs = inputParams.maxConcurrentJobs; // Max number of concurrent jobs.
        this._maxJobRuntime = inputParams.maxJobRuntime; // Time after which a job execution can be forcibly stopped.

        //setInterval(this.pollJobs(), 1000);
    }

    // Handles a job submission request by a user. If no constraints are violated, the request is accepted.
    handleRequest(requestData) {
        let userIndex = this.findUserIndex(requestData);
        console.log("userIndex " + userIndex);

        if (userIndex === -1) { //User is submitting a request for the first time.
            // Proceeds only if the max number of requests per time unit by all users has not been exceeded.
            if (this.checkGlobalRequests(requestData)) {
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
                // Logs the request to database.
                this.registerRequestToDatabase(requestData);
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
            }
        }
    }

    // Returns true if the request can be serviced.
    verifyRequest(requestData) {
        if (!this.checkUserRequests(requestData, this._users[this.findUserIndex(requestData)])) {
            console.log("Request denied.");
            return false;
        }
        console.log("Request accepted.");
        return true;
    }

    // Verifies whether any request-per-time-unit constraints would be violated by the input request.
    // Returns true if no constraints are violated.
    checkUserRequests(requestData, user) {
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

    // Logs a request (ip and timestamp) to database.
    registerRequestToDatabase(requestData) {
        Db.performInsertOne(requestData, "test");
    }

    // Returns the index of the _users array corresponding to the user who submitted the input requests.
    // Returns -1 if said user is not found.
    findUserIndex(requestData) {
        return this._users.findIndex((elem) => {
            return elem.ip === requestData.ip;
        });
    }

    // Submits a job to the SGE via the qsub command.
    addJob(path) {
        console.log("addJob: qsub " + path);

        if (this._jobs.length >= this._maxConcurrentJobs) {
            console.log("Request denied. Max number of concurrent jobs reached.");
            return false;
        }

        let jobName = pathModule.basename(path);

        const spawn = require('child_process').spawn;

        const qsub = spawn("qsub", [path]);

        qsub.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
            // Adds the job to the jobs list.
            this._jobs.push({
                name: jobName,
                time: new Date().getTime()
            });
        });

        qsub.stderr.on('data', (data) => {
            console.log(`stderr: ${data}`);
        });

        qsub.on('close', (code) => {
            console.log(`child process exited with code ${code}`);
        });

        return true;
    }

    // Checks the input job's status using the qstat command.
    // TODO: NOT WORKING YET
    checkJob(name) {
        const spawn = require('child_process').spawn;

        const qstat = spawn("qstat", ['-f', '-j ' + name]);

        console.log("qstatting");

        qstat.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
        });

        qstat.stderr.on('data', (data) => {
            console.log(`stderr: ${data}`);
        });

        qstat.on('close', (code) => {
            console.log(`child process exited with code ${code}`);
        });

        return true;
    }

    /*
    TODO: POLLING FUNCTION TO PERIODICALLY CHECK SUBMITTED JOBS
    pollJobs(name) {
        for (let i = 0; i < this._jobs.length; i++) {
            this.checkJob(name);
        }
    }*/

}

export default new SchedulerSecurity({
    maxReqPerSecUser: 2,
    maxReqPerSecGlobal: 4,
    blockingTimeUser: 2000,
    blockingTimeGlobal: 6000,
    requestLifespan: 5000,
    maxConcurrentJobs: 1,
    maxJobRuntime: 10000
});
