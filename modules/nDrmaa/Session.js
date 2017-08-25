import * as Exception from "./Exceptions";

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

  get TIMEOUT_WAIT_FOREVER(){ return TIMEOUT_WAIT_FOREVER }
  get SUSPEND(){ return SUSPEND }
  get RESUME(){ return RESUME }
  get HOLD(){ return HOLD }
  get RELEASE(){ return RELEASE }
  get TERMINATE(){ return TERMINATE }

  getJobs(){
    return this.jobs;
  }

  getJobArray(){

  }

  runJob(jobTemplate){

  }
}