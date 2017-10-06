/**
 * The Job class represents a job submitted to the DRMS. It contains various information such as the job's id,
 * the session it belongs to, the job template that with the option used for its creation, and other info if the job
 * is an array job.
 */
class Job{
  /**
   * Create a Job object
   * @param {number} jobId - The id of the job
   * @param {string} sessionName - Name of the belonging session
   * @param {JobTemplate} jobTemplate - Job's submission options
   * @param {boolean} isJobArray - Whether the job is an array job
   * @param {?number} jobArrayStart - Starting array job index
   * @param {?number} jobArrayEnd - Ending array job index
   * @param {?number} jobArrayIncr - Increment array job index
   */
  constructor(jobId, sessionName, jobTemplate, isJobArray = false, jobArrayStart = null, jobArrayEnd = null, jobArrayIncr = null){
    /**
     * The id of the job
     * @type {number}
     */
    this.jobId = jobId;

    /**
     * Name of the belonging session
     * @type {string}
     */
    this.sessionName = sessionName;

    /**
     * Template used for creating the job (i.e. job's submission options)
     * @type {JobTemplate}
     */
    this.jobTemplate = jobTemplate;

    /**
     * Whether it's an array job
     * @type {boolean}
     */
    this.isJobArray = isJobArray || false;

    /**
     * Starting array job index
     * @type {Number|null}
     */
    this.jobArrayStart = parseInt(jobArrayStart) || null;

    /**
     * Ending array job index
     * @type {Number|null}
     */
    this.jobArrayEnd = parseInt(jobArrayEnd) || null;

    /**
     * Increment array job index
     * @type {Number|null}
     */
    this.jobArrayIncr = parseInt(jobArrayIncr) || null;

    console.log("Created"+ (this.isJobArray ? " array " :" ") + "job: " + this.jobId + ", "+this.sessionName +
      (this.isJobArray ? ( ", " + this.jobArrayStart + "-" + this.jobArrayEnd + ":" +this.jobArrayIncr) : ""));

  }
}

export default Job