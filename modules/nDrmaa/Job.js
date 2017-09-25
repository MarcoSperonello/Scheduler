/**
 * The Job class represents a job submitted to the DRMS. It contains various information such as the job's id,
 * the session it belongs to, the job template that with the option used for its creation, and other info if the job
 * is an array job.
 */
export default class Job{
  constructor(jobId, sessionName, jobTemplate, isJobArray = false, jobArrayStart = null, jobArrayEnd = null, jobArrayIncr = null){
    this.jobId = jobId;
    // this.jobStatus="UNDETERMINED";
    this.sessionName = sessionName;
    this.jobTemplate = jobTemplate;
    this.isJobArray = isJobArray || false;
    this.jobArrayStart = parseInt(jobArrayStart) || null;
    this.jobArrayEnd = parseInt(jobArrayEnd) || null;
    this.jobArrayIncr = parseInt(jobArrayIncr) || null;

    console.log("Created"+ (this.isJobArray ? " array " :" ") + "job: " + this.jobId + ", "+this.sessionName +
      (this.isJobArray ? ( ", " + this.jobArrayStart + "-" + this.jobArrayEnd + ":" +this.jobArrayIncr) : ""));

  }
}