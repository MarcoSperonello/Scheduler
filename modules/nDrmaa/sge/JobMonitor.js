import * as sge from "./sge-cli";
import * as Exception from "../Exceptions";
import Job from "../Job";
import {EventEmitter} from "events";

let _refreshInterval = 1000;                    // Refresh interval for the monitor
/**
 * Class for monitoring job execution completion.
 * @extends EventEmitter
 */
class JobMonitor extends EventEmitter{
  /**
   * Initialize monitor's parameters.
   */
  constructor(){
    super();
    this.setMaxListeners(0);                    // Set to infinity the max number of listeners for this EventEmitter.
    this.JobsQueue = [];                        // List of jobs to monitor
    this.startMonitor();                        // Starts monitoring
    console.log("Job Monitor started");
  }

  /**
   * Registers a list of jobs to monitor for completion status.
   * @param {Job[]} jobs - List of jobs to register for completion update.
   * @throws {module:nDrmaaExceptions.InvalidArgumentException} InvalidArgumentException - The array passed does not
   *    contain elements of class Job
   */
  registerJobs(jobs){
    jobs.forEach((job) => {
      if(!(job instanceof Job))
        throw new Exception.InvalidArgumentException("Function registerJob(jobs): argument 'jobs' must be an array of " +
          " elements of class Job");
      this.JobsQueue.push(job);
    });
  }

  /**
   * Starts the monitor.
   */
  startMonitor(){
    this.monitor = setInterval(() => {
      this.getJobs();
    }, _refreshInterval)
  }

  /**
   * JobCompleted event. Fires when a job has completed its execution.
   * Returns the Id of the completed job.
   *
   * @event JobCompleted
   * @type {number}
   */

  /**
   * JobError event. Fires when a job has encountered an error and could not complete its execution.
   * Returns the Id of the job in error.
   *
   * @event JobError
   * @type {number}
   */

  /**
   * qstatError event. Fires when the invocation of command qstat could not be executed due to some error.
   * Returns the error reason.
   *
   * @event qstatError
   * @type {*}
   */

  /**
   * Get the list of currently active jobs from qstat, and emits event according to the completion status of each
   * registered job: if a job is registered but does not show up on the list returned by qstat, it emits a "JobCompleted"
   * event with the id of the job as a message; otherwise, if it appears on the list but its status is marked as "ERROR",
   * emit the event "JobError" along with the id of the job.
   * @fires JobCompleted
   * @fires JobError
   * @fires qstatError
   */
  getJobs(){
    if(this.JobsQueue.length>0) {
      sge.qstat().then((qstatJobs) => {
        this.JobsQueue.forEach((job) => {

          let jobId = job.jobId;

          // The job does not appear on the list returned by qstat -> COMPLETED
          if (!qstatJobs[jobId]) {
            this.JobsQueue.splice(this.JobsQueue.indexOf(job), 1);
            this.emit("JobCompleted", jobId);
          }
          // The job does not appear on the list returned by qstat -> check if it is in error state
          else {
            let jobStatus = job.isJobArray ? _parseJobArrayStatus(qstatJobs[jobId])
              : _parseJobStatus(qstatJobs[jobId]["jobState"]);

            if (jobStatus === "ERROR") {
              this.JobsQueue.splice(this.JobsQueue.indexOf(job), 1);
              this.emit("JobError", jobId);
            }
          }
        });
      }, (err) => {
        this.emit("qstatError", err);
      });
    }
  }

}


/**
 * Helper method for retrieving the status of a job
 * @param {string} jobStatus - raw status parsed from qstat
 * @returns {string} - a more explicative status.
 * @private
 */
function _parseJobStatus(jobStatus){
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

/**
 * Function to determine whether an array job is in error state. It suffices that only one task of the array job
 * is in error state for the whole job to be marked as in error.
 * @param {Object} jobArrayTasks - list of tasks of the array job retrieved from qstat
 * @returns {string} - "ERROR" if the array job is in error state, "UNDETERMINED" otherwise
 * @private
 */
function _parseJobArrayStatus(jobArrayTasks){
  let jobStatus = "UNDETERMINED";
  for(let taskId in jobArrayTasks) {
    if (jobArrayTasks.hasOwnProperty(taskId)) {
      let taskStatus = _parseJobStatus(jobArrayTasks[taskId].jobState);
      if(taskStatus === "ERROR") return "ERROR";
    }
  }
  return jobStatus;
}

export default JobMonitor