
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
    this.rawInfo = {};      // Contains all the information obtained from qacct
  }

}