import * as Exception from "./Exceptions";

/**
 * Abstract class representing the operations available for interacting with the DRM.
 */

/**
 * Wait indefinitely for a result.  Used with the Session.wait() method.
 */
const TIMEOUT_WAIT_FOREVER = -1;

/**
 * Suspend the job.  Used with the Session.control() method.
 */
const SUSPEND = 0;

/**
 * Resume the job.  Used with the Session.control() method.
 */
const RESUME = 1;

/**
 * Put the job on hold.  Used with the Session.control() method.
 */
const HOLD = 2;

/**
 * Release the hold on the job.  Used with the Session.control() method.
 */
const RELEASE = 3;

/**
 * Kill the job.  Used with the Session.control() method.
 */
const TERMINATE = 4;

/**
 * All jobs submitted during this DRMAA session.  Used with the Session.synchronize() method.
 */
const JOB_IDS_SESSION_ALL = "DRMAA_JOB_IDS_SESSION_ALL";

export default class Session{
  constructor(){
    if (new.target === Session) {
      throw new TypeError("Cannot construct Session instances from its abstract class.");
    }

    this.jobs = [];
    this.sessionName = "";
    this.contact = "";
    this.jobCategories = [];
  }

  // -- Methods for retrieving the values of the constants -- //
  get TIMEOUT_WAIT_FOREVER(){ return TIMEOUT_WAIT_FOREVER }
  get SUSPEND(){ return SUSPEND }
  get RESUME(){ return RESUME }
  get HOLD(){ return HOLD }
  get RELEASE(){ return RELEASE }
  get TERMINATE(){ return TERMINATE }
  get JOB_IDS_SESSION_ALL(){ return JOB_IDS_SESSION_ALL }


  /**
   * Submits a Grid Engine job with attributes defined in the JobTemplate jobTemplate parameter.
   * @param jobTemplate: attributes of the job to be run.
   */
  runJob(jobTemplate){ }


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
  getJobProgramStatus(jobId){ }


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
  synchronize(jobsId, timeout){ }


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
  wait(jobId, timeout){ }


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
  control(jobId, action){ }

}