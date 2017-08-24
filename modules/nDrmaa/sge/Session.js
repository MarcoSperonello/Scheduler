import * as Exception from "../Exceptions";
import * as sge from "./sge-cli";
import {when, defer} from "promised-io";
import JobTemplate from "../JobTemplate";
import Job from "../Job";

export default class Session{
  constructor(sessionName,contact,jobCategories){
    this.TIMEOUT_WAIT_FOREVER = -1;

    this.jobs = [];
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
      // assicurarsi che non ci sia un job con lo stesso ID per sicurezza
      this.jobs.push(job);
      def.resolve(job);
    });

    return def.promise;
  }

  /**
   * Get the program status of the job.
   * @param job: the job of which we want to know to status.
   */
  getJobProgramStatus(job){
    let def = new defer();

    if(!(job instanceof Job))
      throw new Exception.InvalidArgumentException("Job must be an instance of class Job");

    let jobStatus = "UNDETERMINED";

    when(sge.qstat(), (jobs) => {
       if(jobs[job.jobId]){
         // The job appears on the list (hence not completed/failed)
         switch(jobs[job.jobId].jobState){
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
          when(sge.qacct(job), (jobInfo) => {
            if(jobInfo.failed !== "0")
              jobStatus = "FAILED";
            else if(jobInfo.exit_status === "0")
              jobStatus = "DONE";

            def.resolve(jobStatus);
          });
       }
    });

    return def.promise;
  }

  /**
   * Waits for a particular job to complete its execution. If the job completes successfully or with a failure status,
   * returns the job information using the command "qacct", otherwise if there's an error returns the job information
   * retrieved with the command "qstat" in order to be able to access the error reason.
   * @param job: job to wait for
   * @param timeout: amount of time in milliseconds to wait for the job to terminate its execution.
   * Can pass the value this.TIMEOUT_WAIT_FOREVER to wait indefinitely for the job termination.
   */
  wait(job, timeout){
    let def = new defer();
    let refreshInterval = 1000;
    let hasTimeout = timeout !== this.TIMEOUT_WAIT_FOREVER;

    if(!(job instanceof Job)) {
      throw new Exception.InvalidArgumentException("Job must be an instance of class Job");
    }

    if(hasTimeout && timeout < refreshInterval)
      throw new Exception.InvalidArgumentException("Timeout must be greater than refresh interval (" + refreshInterval + ")");

    let monitor = setInterval(() => {

      when(this.getJobProgramStatus(job), (jobStatus) => {
        if(jobStatus === "DONE" || jobStatus === "FAILED")
        {
          clearInterval(monitor);

          when(sge.qacct(job), (jobInfo) => {
            def.resolve(jobInfo)
          });
        }
        else if(jobStatus === "ERROR")
        {
          clearInterval(monitor);

          when(sge.qstat(job), (jobInfo) => {
            def.reject(jobInfo)
          });
        }
      });
    }, refreshInterval);

    if(hasTimeout)
    {
      setTimeout(() => {
        clearInterval(monitor);
        def.reject(new Exception.ExitTimeoutException("Timeout expired after " + timeout + " ms"));
      }, timeout)
    }

    return def.promise;
  }

}