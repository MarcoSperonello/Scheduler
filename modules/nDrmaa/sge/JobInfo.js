import JobInfoBase from "../JobInfo";

export default class JobInfo extends JobInfoBase{
  constructor(info) {
    super();
    this.jobId = info.jobnumber;
    this.exitStatus = info.exit_status;
    this.failed = info.failed;
    this.rawInfo = info;
  }
}