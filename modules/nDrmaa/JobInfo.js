/**
 * Abstract class representing the status and info of a finished job.
 */
class JobInfo{
  /**
   * Initialize an empty JobInfo object.
   */
  constructor()
  {
    // Make sure that this class can't be constructed directly but only through subclasses
    if (new.target === JobInfo) {
      throw new TypeError("Cannot construct JobInfo instances from its abstract class.");
    }

    /**
     * Job id.
     * @type {number}
     */
    this.jobId = null;

    /**
     * Job's exit code.
     * @type {number}
     */
    this.exitStatus = null;

    /**
     * Job's failure code
     * @type {string}
     */
    this.failed = null;

    /**
     * Error reasons.
     * @type {string[]}
     */
    this.errors = null;

    /**
     * Whether the error was deleted using the "control(..)" API of class Session.
     * @type {boolean}
     */
    this.deleted = false;

    /**
     * Contains all the information obtained about the job's completion.
     * @type {Object}
     */
    this.rawInfo = {};
  }
}

export default JobInfo;