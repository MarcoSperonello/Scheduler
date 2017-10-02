/**
 * The Job class represents a job submitted to the DRMS. It contains various information such as the job's id,
 * the session it belongs to, the job template that with the option used for its creation, and other info if the job
 * is an array job.
 */
export default class Job{
  /**
   * Create a Job object
   * @param {number} jobId - The id of the job
   * @param {string} sessionName - Name of the belonging session
   * @param {JobTemplate} jobTemplate - Template used for creating the job (i.e. job's submission options)
   * @param {boolean} isJobArray - Whether it's an array job
   * @param {?number} jobArrayStart - Starting array job index
   * @param {?number} jobArrayEnd - Ending array job index
   * @param {?number} jobArrayIncr - Increment array job index
   */
  constructor(jobId, sessionName, jobTemplate, isJobArray = false, jobArrayStart = null, jobArrayEnd = null, jobArrayIncr = null){
    this.jobId = jobId;
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