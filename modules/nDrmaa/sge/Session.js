import * as Exception from "../Exceptions";
import * as sge from "./sge-cli";
import {when, defer} from "promised-io";
import SessionBase from "../Session";
import JobTemplate from "../JobTemplate";
import Job from "../Job";
import JobInfo from "./JobInfo";

/**
 * The Session class provides a DRMAA interface to Grid Engine.
 */
export default class Session extends SessionBase{
  constructor(sessionName,contact,jobCategories){
    super();
    this.jobs = {};
    this.sessionName = sessionName;
    this.contact = contact;
    this.jobCategories = jobCategories || [];
  }

  /**
   * Submits a Grid Engine job with attributes defined in the JobTemplate jobTemplate parameter.
   * @param jobTemplate: attributes of the job to be run.
   */
  runJob(jobTemplate){
    if (!(jobTemplate instanceof JobTemplate)){
      throw new Exception.InvalidArgumentException("Job Template must be an instance of JobTemplate");
    }


    let def = new defer();

    when(sge.qsub(jobTemplate), (res) => {
      let id = res.stdout.split(" ")[2];
      console.log("job id: "+id);
      let job = new Job(id,this.sessionName,jobTemplate);
      this.jobs[id]=job;
      def.resolve(id);
    }, (err) => {
      console.log(err);
      def.reject(err);
    });

    return def.promise;
  }

  /**
   * Get the program status of the job identified by jobId. The returned object describing the status of the job has
   * two properties: mainStatus and subStatus. The subStatus property is used to better distinguish a job that has
   * finished its execution. These are possible values for mainStatus, also listing the possible subStatus values for
   * the "COMPLETED" mainStatus:
   *
   * - QUEUED: job is queued
   * - ON_HOLD: job is queued and on hold
   * - RUNNING: job is running
   * - SUSPENDED: job is suspended
   * - ERROR: job is in error state.
   * - COMPLETED: job has finished execution
   * 	  + UNDETERMINED: job execution finished but status cannot be determined
   * 	  + DONE: job execution finished normally
   *  	+ FAILED: job execution finished, but failed.
   * @param jobId: the id of the job whose status is to be retrieved
   */
  getJobProgramStatus(jobId){
    let def = new defer();

    if(!this.jobs[jobId])
      def.reject(new Exception.InvalidArgumentException("No jobs with id " + jobId + " were found in session "
        + this.sessionName));

    let jobStatus = {
      mainStatus: null,
      subStatus: null
    };

    when(sge.qstat(), (jobs) => {
      if(jobs[jobId]){
        // The job appears on the list returned by qstat (hence not finished successfully/failed)
        switch(jobs[jobId].jobState){
          case "qw":
            jobStatus.mainStatus = "QUEUED";
            break;

          case "hqw":
          case "hRqw":
          case "hRwq":
            jobStatus.mainStatus = "ON_HOLD";
            break;

          case "r":
          case "t":
          case "Rr":
          case "Rt":
            jobStatus.mainStatus = "RUNNING";
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
            jobStatus.mainStatus = "SUSPENDED";
            break;

          case "Eqw":
          case "Ehqw":
          case "EhRqw":
            jobStatus.mainStatus = "ERROR";
            break;

        }
        def.resolve(jobStatus);
      }
      else{
        // The job is not on the list, hence it must have finished successfully or failed.
        // We thus have to use the qacct function to query the info of finished jobs.
        jobStatus.mainStatus = "COMPLETED";

        when(sge.qacct(jobId), (jobInfo) => {
          // Job execution has finished but its report has yet to show
          // up on qacct, so its precise status can't be determined
          if(jobInfo === "NOT_FOUND")
            jobStatus.subStatus = "UNDETERMINED";

          // Job execution has finished but with failed status.
          else if(jobInfo.failed !== "0")
            jobStatus.subStatus = "FAILED";

          // Job execution has finished successfully
          else
            jobStatus.subStatus = "DONE";

          def.resolve(jobStatus);
        }, (err) => {
          def.reject(err);
        });
      }
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
    let def = new defer();
    let refreshInterval = 1000; // Refresh interval for the jobs' status monitor(s)
    let hasTimeout = timeout !== this.TIMEOUT_WAIT_FOREVER; // Whether the caller specified a timeout
    let completedJobs = []; // Array containing the response data of each job

    // Arguments validation

    if(!Array.isArray(jobIds) && jobIds !== this.JOB_IDS_SESSION_ALL)
      throw new Exception.InvalidArgumentException("Jobs list must be an array!");

    if(!jobIds || jobIds.length===0)
      throw new Exception.InvalidArgumentException("Empty jobs list: there must be at least one job in the list!");

    // Passing a timeout that is less than the monitor's refresh interval makes no sense.
    if (hasTimeout && timeout < refreshInterval)
      throw new Exception.InvalidArgumentException("Timeout must be greater than refresh interval " +
        "(" + refreshInterval + ")");


    if(jobIds === this.JOB_IDS_SESSION_ALL)
      jobIds = Object.keys(this.jobs);

    jobIds.forEach((jobId) => {

      if(jobIds !== this.JOB_IDS_SESSION_ALL && !this.jobs[jobId]) {
        def.reject(new Exception.InvalidArgumentException("No jobs with id " + jobId + " were found in session "
        + this.sessionName));
        return;
      }

      // Monitor that checks the status of a given job every refreshInterval milliseconds.
      let monitor = setInterval(() => {

        when(this.getJobProgramStatus(jobId), (jobStatus) => {

          // Job execution terminated
          if(jobStatus.mainStatus === "COMPLETED")
          {
            // Stop the monitor, compose the response object and push it inside the array
            // to return after all jobs finished execution.
            clearInterval(monitor);

            let response = {
              jobId: jobId,
              msg:'Job ' + jobId + ' completed',
              jobStatus: jobStatus,
              errors: null
            };

            completedJobs.push(response);

            // If all jobs have terminated their execution, resolve the promise
            if(completedJobs.length === jobIds.length)
              def.resolve(completedJobs);
          }

          // Job is in error state.
          // May remove this condition in case you want to allow waiting for jobs that are in error status (jobs in
          // error state remain in queue until the job is removed or the error reason is fixed, hence the system might
          // wait forever)
          else if(jobStatus.mainStatus === "ERROR")
          {
            // Retrieve the error reason with qstat.
            clearInterval(monitor);

            when(sge.qstat(jobId), (jobStats) => {
              let response = {
                jobId: jobId,
                msg: "Job " + jobId + " is in error state.",
                jobStatus: jobStatus,
                errors: jobStats["error_reason"]
              };

              completedJobs.push(response);

              if(completedJobs.length === jobIds.length)
                def.resolve(completedJobs);
            }, (err) => {
              def.reject(err);
            });
          }
        }, (err) => {
          def.reject(err);
        });
      }, refreshInterval);


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
    });

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
    let def = new defer();
    let refreshInterval = 1000;
    let hasTimeout = timeout !== this.TIMEOUT_WAIT_FOREVER;

    if(!this.jobs[jobId])
      def.reject(new Exception.InvalidArgumentException("No jobs with id " + jobId + " were found in session "
        + this.sessionName));

    if(hasTimeout && timeout < refreshInterval)
      throw new Exception.InvalidArgumentException("Timeout must be greater than refresh interval (" + refreshInterval + ")");

    when(this.synchronize([jobId], timeout), (response) => {
      let jobState = response[0].jobStatus;
      if(jobState.mainStatus === "COMPLETED"){
        if(jobState.subStatus === "DONE" || jobState.subStatus === "FAILED"){
          when(sge.qacct(jobId), (jobInfo) => {
            def.resolve(new JobInfo(jobInfo))
          }, (err) => {
            def.reject(err);
          });
        }
        // Job subStatus is UNDETERMINED (i.e. not yet available on qacct)
        else{
          let monitor = setInterval(() => {
            when(sge.qacct(jobId), (jobInfo) => {
              if(jobInfo !== "NOT_FOUND"){ // Job information available, stop the monitor and return the info.
                clearInterval(monitor);
                def.resolve(new JobInfo(jobInfo));
              }
            }, (err) => {
              def.reject(err);
            });
          }, refreshInterval);

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
   *  This routine returns once the action has been acknowledged by the DRM system, but does not necessarily wait
   *  until the action has been completed.
   *
   *  Returns an array of objects, one for each jobs on which the action is performed, with the following properties:
   *  {
   *    jobId: the id of the job
   *    response: the response given by a successful call to the function performing the desired action
   *    error: the error given by a unsuccessful call to the function performing the desired function
   *  }
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

}