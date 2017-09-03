import JobInfoBase from "../JobInfo";

/**
 * This class provides information about a completed Grid Engine job.
 */
export default class JobInfo extends JobInfoBase{
  constructor(info) {
    super();
    this.jobId = info.jobnumber;        // Job id
    this.exitStatus = info.exit_status; // exit code
    this.failed = info.failed;          // Failure code
    this.rawInfo = info;                // Contains all the information obtained from qacct
  }
}