import * as Exception from "../Exceptions";
import * as sge from "./sge-cli";
import {when, defer, all} from "promised-io";
import SessionBase from "../Session";
import JobTemplate from "../JobTemplate";
import Job from "../Job";
import JobInfo from "./JobInfo";

let _refreshInterval = 1000;                    // Refresh interval for the jobs' status monitoring

/**
 * The Session class provides a DRMAA interface to Grid Engine.
 */
export default class Session extends SessionBase{
  constructor(sessionName,contact){
    super();
    this.jobs = {};                             // List of jobs submitted in this session, indexed by id
    this.sessionName = sessionName;             // Session name
    this.contact = contact;
  }

  /**
   * Submits a Grid Engine job with attributes defined in the JobTemplate jobTemplate parameter.
   * @param jobTemplate: attributes of the job to be run.
   * @return promise: the promise is resolved either with the id of the job that was successfully submitted, or it is
   *                  rejected with the occurred error.
   */
  runJob(jobTemplate){
    if (!(jobTemplate instanceof JobTemplate)){
      throw new Exception.InvalidArgumentException("Job Template must be an instance of JobTemplate");
    }

    let def = new defer();

    when(sge.qsub(jobTemplate), (res) => {
      let id = res.stdout.split(" ")[2];
      let job = new Job(id, this.sessionName, jobTemplate);
      this.jobs[id] = job;
      def.resolve(id);
    }, (err) => {
      def.reject(err);
    });

    return def.promise;
  }

  /**
   * Submits a Grid Engine array job very much as if the qsub option `-t start-end:incr' had been used with the
   * corresponding attributes defined in the DRMAA JobTemplate.
   * The same constraints regarding qsub -t value ranges also apply to the parameters start, end, and incr.
   * @param jobTemplate: attributes of each job belonging to the array job to be run.
   * @param start: the starting value for the loop index
   * @param end: the terminating value for the loop index
   * @param incr: the value by which to increment the loop index each iteration
   * @return promise: the promise is resolved either with the id of the array job that was successfully submitted, or
   *                  it is rejected with the occurred error.
   */
  runBulkJobs(jobTemplate, start, end, incr){
    if (!(jobTemplate instanceof JobTemplate)){
      throw new Exception.InvalidArgumentException("Job Template must be an instance of JobTemplate");
    }

    if(!start)
      throw new Exception.InvalidArgumentException("Missing starting index for array job");

    let def = new defer();

    when(sge.qsub(jobTemplate, start, end, incr), (res) => {
      let id = res.stdout.split(" ")[2].split(".")[0];

      // Get the indices directly from the output of SGE, since using the ones passed upon method's invocation
      // would require some checks (e.g. check that start<end, check if a value for incr was passed etc)
      let jobArrInfo = {
        start: res.stdout.split(" ")[2].split(".")[1].split("-")[0],
        end: res.stdout.split(" ")[2].split(".")[1].split("-")[1].split(":")[0],
        incr: res.stdout.split(" ")[2].split(".")[1].split("-")[1].split(":")[1]
      };

      this.jobs[id] = new Job(id, this.sessionName, jobTemplate, true, jobArrInfo.start, jobArrInfo.end, jobArrInfo.incr);

      def.resolve(id);
    }, (err) => {
      def.reject(err);
    });

    return def.promise;

  }

  /**
   * Get the program status of the job(s) specified in jobIds.
   * The promise returned is resolved with a JSON object describing the status of the job, indexed by id, which has the
   * following structure:
   *
   * {
   *   jobId1:      {
   *                  mainStatus: {string},
   *                  subStatus: {string}
   *                },
   *
   *   jobId2:      {
   *                  mainStatus: {string},
   *                  subStatus: {string}
   *                },
   *
   *   jobArrayId: {
   *                  mainStatus: {string},
   *                  subStatus: {string},
   *                  jobTaskId1: {
   *                                mainStatus: {string},
   *                                subStatus: {string}
   *                              },
   *                  jobTaskId2: {
   *                                mainStatus: {string},
   *                                subStatus: {string}
   *                              },
   *                }
   * }
   *
   * where:
   * - jobId1, jobId2, ... jobIdN are the ids of each job for which the invoker wants to retrieve the status;
   * - jobArrayId is the result given by the method invocation on a job id that identifies a job array:
   *    the response objects for this kind of special jobs contains, other than the global status of the whole
   *    array job, another nested object, one for each job task belonging to the job array (identified by jobTaskId),
   *    specifying the status of each job's task.
   *
   * Each job (or task) has an object containing two properties: mainStatus and subStatus.
   * The subStatus property is used to better distinguish a job that has finished its execution.
   *
   * These are possible values for the mainStatus property:
   * - UNDETERMINED: (only for array jobs) one or more job's tasks are either running, queued, on hold, or suspended.
   * - QUEUED: job is queued
   * - ON_HOLD: job is queued and on hold
   * - RUNNING: job is running
   * - SUSPENDED: job is suspended
   * - ERROR: job is in error state.
   * - COMPLETED: job has finished execution
   *
   *
   * These are possible values for the subStatus property:
   * - null: the job's main status is not "COMPLETED"
   * - UNDETERMINED: job execution finished but status cannot be determined
   * - DONE: job execution finished normally
   * - FAILED: job execution finished, but failed.
   *
   * @param jobIds: the id(s) of the job(s) whose status is to be retrieved
   * @return promise
   */
  getJobProgramStatus(jobIds){
    let def = new defer();
    let jobsToQuery = [];     // List of jobs to query
    let numJobsQueried = 0;   // Number of jobs that have been queried successfully
    let response = {};        // Object containing the response data for each job, indexed by jobId



    // ----- Arguments validation ----- //

    // If the argument passed is an array containing the jobs ids
    if(Array.isArray(jobIds))
      jobsToQuery = jobIds;  // Assign the job ids of the argument to the variable jobsToQuery

    // Otherwise, if the Session.JOB_IDS_SESSION_ALL constant has been passed as an argument
    else if(jobIds === this.JOB_IDS_SESSION_ALL)
      jobsToQuery = Object.keys(this.jobs);  // Assign all the jobs of this session to jobsToQuery

    // Lastly, the argument is invalid, hence throw an exception.
    else
      def.reject(new Exception.InvalidArgumentException("Invalid argument: argument must be either an array of job ids " +
        "or the special constant Session.JOB_IDS_SESSION_ALL"));

    // Assert that there's at least one job specified in the job ids array
    if(!jobIds || jobIds.length===0)
      def.reject(new Exception.InvalidArgumentException("Empty jobs list: there must be at least one job in the list!"));

    // Assert that each job id passed as argument belongs to this session
    jobsToQuery.forEach((jobId) => {
      if (!this.jobs[jobId])
        def.reject(new Exception.InvalidArgumentException("No jobs with id " + jobId + " were found in session "
          + this.sessionName));
    });

    // -------------------------------- //


    // Execute the qstat command, returning the list of jobs submitted to SGE
    when(sge.qstat(), (jobs) => {

      // Iterate through each of the jobs to query
      jobsToQuery.forEach((jobId) => {

        // Object describing the status of each job
        let jobStatus = {
          mainStatus: null,
          subStatus: null
        };

        // We are dealing with a job array
        if(this.jobs[jobId]["isJobArray"])
        {
          let completedTasks = [];
          let jobArray = this.jobs[jobId];
          let start = jobArray.jobArrayStart, end = jobArray.jobArrayEnd, incr = jobArray.jobArrayIncr;

          response[jobId] = {};

          // Iterate over each array job's task to retrieve their status
          for(let taskId = start; taskId<=end; taskId+=incr){

            // Object describing the status of each task belonging to the array job
            let taskStatus = {
              mainStatus: null,
              subStatus: null
            };

            // The task appears on the list returned by qstat (hence not finished yet)
            if(jobs[jobId] && jobs[jobId][taskId]){
              taskStatus.mainStatus = this._parseJobStatus(jobs[jobId][taskId].jobState);

            }
            else{
              taskStatus.mainStatus = "COMPLETED";
              completedTasks.push(taskId);
            }

            // Add an entry to the response object for the jobId, containing the retrieved status
            response[jobId][taskId] = taskStatus;
          }

          when(sge.qacct(jobId), (jobInfo) => {
            completedTasks.forEach((taskId) => {

              if (jobInfo.notFound || !jobInfo[taskId])
                response[jobId][taskId].subStatus = "UNDETERMINED";

              // Job execution has finished but with failed status.
              else if (jobInfo[taskId]["failed"] !== "0")
                response[jobId][taskId].subStatus = "FAILED";

              // Job execution has finished successfully
              else
                response[jobId][taskId].subStatus = "DONE";

            });

            // Determine the global job status according to its tasks' statuses.
            jobStatus = this._getArrayJobStatus(response[jobId]);

            response[jobId]["mainStatus"] = jobStatus.mainStatus;
            response[jobId]["subStatus"] = jobStatus.subStatus;


            // At this point, the status of all the job's tasks has been retrieved, hence
            // we can increment the counter of the successfully queried jobs
            numJobsQueried++;

            if(numJobsQueried === jobsToQuery.length)
            // Resolve the promise if we retrieved the status for all the jobs passed by the invoker
              def.resolve(response);

          }, (err) => {
            def.reject(err);
          });
        }

        // We are dealing with a single job
        else{

          // The job appears on the list returned by qstat (hence not finished successfully/failed)
          if(jobs[jobId]){
            jobStatus.mainStatus = this._parseJobStatus(jobs[jobId].jobState);

            // Add an entry to the response object for the jobId, containing the retrieved status
            response[jobId] = jobStatus;

            numJobsQueried++;

            if(numJobsQueried === jobsToQuery.length)
            // Resolve the promise if we retrieved the status for all the jobs passed by the invoker
              def.resolve(response);
          }

          // The job is not on the list returned by qstat, hence it must have finished execution successfully or failed.
          // We thus have to use the qacct function to query the info of finished jobs.
          else{
            jobStatus.mainStatus = "COMPLETED";

            when(sge.qacct(jobId), (jobInfo) => {
              // Job execution has finished but its report has yet to show
              // up on qacct, so its precise status can't be determined
              if(jobInfo.notFound)
                jobStatus.subStatus = "UNDETERMINED";

              // Job execution has finished but with failed status.
              else if(jobInfo.failed !== "0")
                jobStatus.subStatus = "FAILED";

              // Job execution has finished successfully
              else
                jobStatus.subStatus = "DONE";

              // Add an entry to the response object for the jobId, containing the retrieved status
              response[jobId] = jobStatus;

              numJobsQueried++;

              if(numJobsQueried === jobsToQuery.length)
                // Resolve the promise if we retrieved the status for all the jobs passed by the invoker
                def.resolve(response);

            }, (err) => {
              def.reject(err);
            });
          }
        }
      });
    }, (err) => {
      def.reject(err);
    });

    return def.promise;
  }

  /**
   * The synchronize() method returns when all jobs specified in jobIds have failed or finished
   * execution. If jobIds contains JOB_IDS_SESSION_ALL, then this method waits for all jobs submitted during this
   * DRMAA session.
   *
   * To prevent blocking indefinitely in this call, the caller may use timeout, specifying how many milliseconds to wait
   * for this call to complete before timing out. The special value TIMEOUT_WAIT_FOREVER can be used to wait
   * indefinitely for a result.
   *
   * The promise resolves a with an object indicating different information for each job.
   * It rejects with ExitTimeoutException if the timeout expires before all jobs finish.
   *
   * @param jobIds: the ids of the jobs to synchronize
   * @param timeout: the maximum number of milliseconds to wait
   */
  synchronize(jobIds, timeout){
    timeout = timeout || this.TIMEOUT_WAIT_FOREVER;         // If not specified, timeout is set to wait forever
    let def = new defer();
    let hasTimeout = timeout !== this.TIMEOUT_WAIT_FOREVER; // Whether the caller specified a timeout
    let jobsToSync = [];                                    // List of jobs to synchronize
    let completedJobs = [];                                 // Array containing the response data of each job
    let totalJobs = 0;                                      // Number of jobs to synchronize

    // Arguments validation
    // If the argument passed is an array containing the jobs ids
    if(Array.isArray(jobIds))
      jobsToSync = jobIds;  // Assign the job ids of the argument to the variable jobsToSync

    // Otherwise, if the Session.JOB_IDS_SESSION_ALL constant has been passed as an argument
    else if(jobIds === this.JOB_IDS_SESSION_ALL)
      jobsToSync = Object.keys(this.jobs);  // Assign all the jobs of this session to jobsToSync

    // Lastly, the argument is invalid, hence throw an exception.
    else
      def.reject(new Exception.InvalidArgumentException("Invalid argument: argument must be either an array of job ids " +
        "or the special constant Session.JOB_IDS_SESSION_ALL"));

    if(!jobIds || jobIds.length===0)
      throw new Exception.InvalidArgumentException("Empty jobs list: there must be at least one job in the list!");

    // Passing a timeout that is less than the monitor's refresh interval makes no sense.
    if (hasTimeout && timeout < _refreshInterval)
      throw new Exception.InvalidArgumentException("Timeout must be greater than refresh interval " +
        "(" + _refreshInterval + ")");

    // Make sure that each job exists in the current session
    jobsToSync.forEach((jobId) => {
      if (!this.jobs[jobId]) {
        def.reject(new Exception.InvalidArgumentException("No jobs with id " + jobId + " were found in session "
          + this.sessionName));
      }
    });



    totalJobs = jobsToSync.length;

    // Monitor that checks the status of the given jobs every _refreshInterval milliseconds.
    let monitor = setInterval(() => {

      // Retrieve the status of the jobs to synchronize.
      when(this.getJobProgramStatus(jobsToSync), (jobs) => {

        // Iterate over each of the jobs returned by getJobProgramStatus()
        for(let jobId in jobs){
          if(jobs.hasOwnProperty(jobId)) {

            let jobStatus = jobs[jobId];

            // Job execution terminated
            if (jobStatus.mainStatus === "COMPLETED") {

              let response = {
                jobId: jobId,
                msg: 'Job ' + jobId + ' completed',
                jobStatus: jobStatus,
                errors: null
              };

              // Push the object containing all the info about the job's status inside the array to return after all
              // jobs terminated their execution
              completedJobs.push(response);

              // Removes the job id from the list of jobs to synchronize.
              jobsToSync.splice(jobsToSync.indexOf(jobId), 1);

              // If all jobs have terminated their execution, resolve the promise and stop the monitor
              if (completedJobs.length === totalJobs) {
                clearInterval(monitor);
                def.resolve(completedJobs);
              }
            }

            // Job is in error state.
            // May remove this condition in case you want to allow waiting for jobs that are in error status (jobs in
            // error state remain in queue until the job is removed or the error reason is fixed, hence the system might
            // wait forever)
            else if (jobStatus.mainStatus === "ERROR") {

              // Retrieve the error reason with qstat.
              when(sge.qstat(jobId), (jobStats) => {

                let response = {
                  jobId: jobId,
                  msg: "Job " + jobId + " is in error state.",
                  jobStatus: jobStatus,
                  errors: jobStats["error_reason"]
                };

                completedJobs.push(response);
                let toRemove = jobsToSync.indexOf(jobId);
                jobsToSync.splice(toRemove, 1);

                if (completedJobs.length === totalJobs) {
                  clearInterval(monitor);
                  def.resolve(completedJobs);
                }
              }, (err) => {
                def.reject(err);
              });
            }
          }
        }
      }, (err) => {
        def.reject(err);
      });
    }, _refreshInterval);


    if(hasTimeout)
    {
      // Clear the monitor after timeout has expired and rejects the promise.
      setTimeout(() => {
        clearInterval(monitor);

        // Since there's one monitor for each job, reject will be called once for each monitor if the timeout expires,
        // causing an exception due to the fact that a deferred has to be resolved only once. We can thus safely
        // ignore this exception.
        try{
          def.reject(new Exception.ExitTimeoutException("Timeout expired before job completion"));
        }
        catch(e) { }
      }, timeout)
    }

    return def.promise;
  }

  /**
   * Wait until a job is complete and the information regarding the job's execution are available.
   * Whether the job completes successfully or with a failure status, returns the job information using the command "qacct";
   * otherwise if there's an error preventing the job from completing, returns the job information retrieved with the
   * command "qstat" in order to be able to access the error reasons.
   *
   * To prevent blocking indefinitely in this call, the caller may use timeout, specifying how many milliseconds to wait
   * for this call to complete before timing out. The special value TIMEOUT_WAIT_FOREVER can be uesd to wait
   * indefinitely for a result.
   *
   * The promise is resolved with an object of class JobInfo containing the information of the completed/failed job, or
   * a JSON with the error reasons for a job that is in ERROR status.
   *
   * @param jobId: the id of the job for which to wait
   * @param timeout: amount of time in milliseconds to wait for the job to terminate its execution.
   */
  wait(jobId, timeout){
    timeout = timeout || this.TIMEOUT_WAIT_FOREVER;
    let def = new defer();
    let hasTimeout = timeout !== this.TIMEOUT_WAIT_FOREVER;

    if(!this.jobs[jobId])
      def.reject(new Exception.InvalidArgumentException("No jobs with id " + jobId + " were found in session "
        + this.sessionName));

    if(hasTimeout && timeout < _refreshInterval)
      throw new Exception.InvalidArgumentException("Timeout must be greater than refresh interval (" + _refreshInterval + ")");

    let job = this.jobs[jobId];
    let isArrayJob = job["isJobArray"];
    let numTasksAJ = isArrayJob ? Math.ceil((job["jobArrayEnd"] - job["jobArrayStart"] + 1)/ job["jobArrayIncr"]) : null;

    when(this.synchronize([jobId], timeout), (response) => {
      let jobState = response[0].jobStatus;
      if(jobState.mainStatus === "COMPLETED"){
        if(jobState.subStatus === "DONE" || jobState.subStatus === "FAILED"){
          when(sge.qacct(jobId), (jobInfo) => {
            def.resolve(new JobInfo(jobInfo));
          }, (err) => {
            def.reject(err);
          });
        }
        // Job subStatus is UNDETERMINED (i.e. not yet available on qacct)
        else{
          let monitor = setInterval(() => {
            when(sge.qacct(jobId), (jobInfo) => {

              // Job information available on qacct.
              if(!jobInfo.notFound){

                // If we are dealing with an array job, make sure that qacct returned the information
                // for all the job's tasks, otherwise we need to do some more polling.
                if(!isArrayJob || (isArrayJob && Object.keys(jobInfo).length === numTasksAJ)) {

                  // Stop the monitor and resolve the promise with the job's info if all the info regarding
                  // this job (or array job's tasks) were retrieved from qacct
                  clearInterval(monitor);
                  def.resolve(new JobInfo(jobInfo));
                }
              }
            }, (err) => {
              def.reject(err);
            });
          }, _refreshInterval);

          if(hasTimeout)
          {
            // Clear the monitor after timeout has expired.
            setTimeout(() => {
              clearInterval(monitor);
              def.reject(new Exception.ExitTimeoutException("Timeout expired before job completion"));
            }, timeout)
          }
        }
      }
      // Just resolve with the information passed over by synchronize()
      else if(jobState.mainStatus === "ERROR"){
        def.resolve(response[0]);
      }
    },(err) => {
      def.reject(err);
    });

    return def.promise;
  }

  /**
   * Hold, release, suspend, resume, or kill the job identified by jobId.
   * If jobId is JOB_IDS_SESSION_ALL, then this routine acts on all jobs submitted during this DRMAA session up to
   * the moment control() is called.
   *
   * The legal values for action and their meanings are:
   *  - SUSPEND: stop the job,
   *  - RESUME: (re)start the job,
   *  - HOLD: put the job on-hold,
   *  - RELEASE: release the hold on the job,
   *  - TERMINATE: kill the job.
   *
   * This routine returns once the action has been acknowledged by the DRM system, but does not wait
   * until the action has been completed.
   *
   * Returns an array of objects, one for each jobs on which the action is performed, with the following properties:
   * {
   *   jobId: the id of the job
   *   response: the response given by a successful call to the function performing the desired action
   *   error: the error given by a unsuccessful call to the function performing the desired function
   * }
   *
   * @param jobId: The id of the job to control
   * @param action: The control action to be taken
   */
  control(jobId, action){
    let def = new defer();

    // Array with the ids of the jobs to control: if JOB_IDS_SESSION_ALL is passed then it will contain all the jobs
    // submitted during this session.
    let jobsList = jobId===this.JOB_IDS_SESSION_ALL ? Object.keys(this.jobs) : [jobId];

    // Container for the response objects of each job that will be used to resolve the promise.
    let response = [];

    // Template for the response of each call to the desired action on each job
    let jobResponse = {
      jobId: null,
      response: "",
      error: ""
    };

    // Check the action's validity
    if (action !== this.SUSPEND &&
        action !== this.RESUME &&
        action !== this.HOLD &&
        action !== this.RELEASE &&
        action !== this.TERMINATE) {
      throw new Exception.InvalidArgumentException("Invalid action: " + action);
    }

    // Iterate through the list of jobs and perform the action on each job
    for(let i=0; i<jobsList.length; i++){
      let jobId = jobsList[i];

      if(!this.jobs[jobId]) {
        def.reject(new Exception.InvalidArgumentException("No jobs with id " + jobId + " were found in session "
          + this.sessionName));
        break;
      }

      when(sge.control(jobId, action), (res) => {

        jobResponse.jobId = jobId;
        jobResponse.response = res;

        response.push(jobResponse);

        // Action was performed on all jobs => resolve
        if(response.length===jobsList.length)
          def.resolve(response);

      }, (err) => {

        jobResponse.jobId = jobId;
        jobResponse.error = err;

        response.push(jobResponse);

        // Action was performed on all jobs => resolve
        if(response.length===jobsList.length)
          def.resolve(response);
      });
    }


    return def.promise;
  }






  /**
   * Get the program status of the job.
   * @param jobId
   */
  getJobProgramSubmitDate(jobId){
    let def = new defer();

    if(!this.jobs[jobId])
      def.reject(new Exception.InvalidArgumentException("No jobs with id " + jobId + " were found in session "
        + this.sessionName));

    let jobSubmitDate = "UNDETERMINED";

    when(sge.qstat(), (jobs) => {
      if(jobs[jobId]){
        // The job appears on the list (hence not completed/failed)
        jobSubmitDate = jobs[jobId].submitDate;
        def.resolve(jobSubmitDate);
      }
      else{
        // The job is not on the list, hence it must be completed or failed.
        // We thus have to use the qacct function to query the info of finished jobs.
        when(sge.qacct(jobId), (jobInfo) => {
          if(jobInfo.failed !== "0")
            jobStatus = "FAILED";
          else
            jobStatus = "DONE";

          def.resolve(jobStatus);
        });
      }
    });

    return def.promise;
  }


  _parseJobStatus(jobStatus){
    switch(jobStatus){
      case "qw":
        return "QUEUED";
        break;

      case "hqw":
      case "hRqw":
      case "hRwq":
        return "ON_HOLD";
        break;

      case "r":
      case "t":
      case "Rr":
      case "Rt":
        return "RUNNING";
        break;

      case "s":
      case "ts":
      case "S":
      case "tS":
      case "T":
      case "tT":
      case "Rs":
      case "Rts":
      case "RS":
      case "RtS":
      case "RT":
      case "RtT":
        return "SUSPENDED";
        break;

      case "Eqw":
      case "Ehqw":
      case "EhRqw":
        return "ERROR";
        break;
    }
  }


  _getArrayJobStatus(jobTasks){

    let globalStatus = {
      mainStatus: null,
      subStatus: null
    };

    for(let taskId in jobTasks){
      if(jobTasks.hasOwnProperty(taskId)){
        if(jobTasks[taskId]["mainStatus"] === "ERROR") {
          globalStatus.mainStatus = "ERROR";
          break;
        }
        else if(jobTasks[taskId]["mainStatus"] !== "COMPLETED") {
          globalStatus.mainStatus = "UNDETERMINED";
          break;
        }
      }
    }

    if(!globalStatus.mainStatus) {
      globalStatus.mainStatus = "COMPLETED";
      for(let taskId in jobTasks){
        if(jobTasks.hasOwnProperty(taskId)) {
          if (jobTasks[taskId]["subStatus"] === "FAILED") {
            globalStatus.subStatus = "FAILED";
            break;
          }
          else if (jobTasks[taskId]["subStatus"] === "UNDETERMINED") {
            globalStatus.subStatus = "UNDETERMINED";
            break;
          }
        }
      }

      if(!globalStatus.subStatus) globalStatus.subStatus = "DONE";
    }

    return globalStatus;
  }

}