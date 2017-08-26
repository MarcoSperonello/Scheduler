import * as Exception from "../Exceptions";
import * as sge from "./sge-cli";
import {when, defer} from "promised-io";
import SessionBase from "../Session";
import JobTemplate from "../JobTemplate";
import Job from "../Job";
//import JobInfo from "./JobInfo";

export default class Session extends SessionBase{
  constructor(sessionName,contact,jobCategories){
    super();
    this.jobs = {};
    this.sessionName = sessionName;
    this.contact = contact;
    this.jobCategories = jobCategories || [];
  }

  // getJobs(){
  //   return this.jobs;
  // }
  //
  // getJobArray(){
  //
  // }

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
   * Get the program status of the job.
   * @param job: the job of which we want to know to status.
   */
  getJobProgramStatus(jobId){
    let def = new defer();

    if(!this.jobs[jobId])
      def.reject(new Exception.InvalidArgumentException("No jobs with id " + jobId + " were found in session "
        + this.sessionName));

    let jobStatus = "UNDETERMINED";

    when(sge.qstat(), (jobs) => {
       if(jobs[jobId]){
         // The job appears on the list (hence not completed/failed)
         switch(jobs[jobId].jobState){
           case "qw":
             jobStatus = "QUEUED";
             break;

           case "hqw":
           case "hRqw":
           case "hRwq":
             jobStatus = "ON_HOLD";
             break;

           case "r":
           case "t":
           case "Rr":
           case "Rt":
             jobStatus = "RUNNING";
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
             jobStatus = "SUSPENDED";
             break;

           case "Eqw":
           case "Ehqw":
           case "EhRqw":
             jobStatus = "ERROR";
             break;

         }
         def.resolve(jobStatus);
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

  /**
   * Get the program status of the job.
   * @param job: the job of which we want to know to status.
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

  /**
   * Waits for a particular job to complete its execution. If the job completes successfully or with a failure status,
   * returns the job information using the command "qacct", otherwise if there's an error preventing the job from
   * completing, returns the job information retrieved with the command "qstat" in order to be able to access the error
   * reasons.
   * @param job: job to wait for
   * @param timeout: amount of time in milliseconds to wait for the job to terminate its execution.
   * Can pass the value this.TIMEOUT_WAIT_FOREVER to wait indefinitely for the job termination.
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

    let monitor = setInterval(() => {

      when(this.getJobProgramStatus(jobId), (jobStatus) => {
        if(jobStatus === "DONE" || jobStatus === "FAILED")
        {
          clearInterval(monitor);

          when(sge.qacct(jobId), (jobInfo) => {
            def.resolve(new JobInfo(jobInfo))
          });
        }
        else if(jobStatus === "ERROR")
        {
          // Job is in error state; retrieve the error reason with qstat.
          clearInterval(monitor);

          when(sge.qstat(jobId), (jobInfo) => {
            def.reject("Job " + jobId + " encountered the following errors: " + jobInfo["error_reason"])
          });
        }
      });
    }, refreshInterval);

    if(hasTimeout)
    {
      setTimeout(() => {
        clearInterval(monitor);
        def.reject(new Exception.ExitTimeoutException("Timeout expired before job completion"));
      }, timeout)
    }

    return def.promise;
  }

  control(jobId, action){
    let def = new defer();

    if(!this.jobs[jobId])
      def.reject(new Exception.InvalidArgumentException("No jobs with id " + jobId + " were found in session "
        + this.sessionName));

    if(action !== this.SUSPEND &&
      action !== this.RESUME &&
      action !== this.HOLD &&
      action !== this.RELEASE &&
      action !== this.TERMINATE){
      throw new Exception.InvalidArgumentException("Invalid action: " + action);
    }

    switch(action){
      case(this.SUSPEND):
        console.log("Suspending job "+jobId);
        break;

      case(this.RESUME):
        console.log("Resuming job "+jobId);
        break;

      case(this.HOLD):
        console.log("Holding job "+jobId);
        break;

      case(this.RELEASE):
        console.log("Releasing job "+jobId);
        break;

      case(this.TERMINATE):
        console.log("Terminating job "+jobId);
        break;
    }

    when(sge.control(jobId, action), (res) => {
      def.resolve(res);
    }, (err) => {
      def.reject(err);
    });

    return def.promise;
  }

}