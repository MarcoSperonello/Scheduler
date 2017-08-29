
export default class JobInfo{
  constructor()
  {
    // Make sure that this class can't be constructed directly but only through subclasses
    if (new.target === JobInfo) {
      throw new TypeError("Cannot construct JobInfo instances from its abstract class.");
    }

    this.jobId = null;
    this.exitStatus = null;
    this.failed = false;
    this.rawInfo = {};
  }

  getExitStatus(){ return this.hasExited() ? this.exitStatus : null; }

  getJobId(){ return this.jobId; }

  hasExited(){ return !!this.exitStatus; }
}