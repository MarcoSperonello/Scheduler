/**
 * The JobInfo class represents the status for a finished job. It contains the job's id, the job's
 * exit and failed status, and an object with all the raw information collected from the DRMS about the job.
 */
export default class JobInfo{
  constructor()
  {
    // Make sure that this class can't be constructed directly but only through subclasses
    if (new.target === JobInfo) {
      throw new TypeError("Cannot construct JobInfo instances from its abstract class.");
    }

    this.jobId = null;      // Job id
    this.exitStatus = null; // exit code
    this.failed = null;     // Failure code
    this.errors = null;     // Error reasons, if any
    this.deleted = false;   // Whether the error was deleted using the "control(..)" API
    this.rawInfo = {};      // Contains all the information obtained about the job's completion.
  }
}