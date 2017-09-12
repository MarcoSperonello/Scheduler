import JobInfoBase from "../JobInfo";

/**
 * This class provides information about a completed Grid Engine job.
 */
export default class JobInfo extends JobInfoBase{
  constructor(info) {
    super();

    let isJobArrayResult = !info.jobnumber;

    if(!isJobArrayResult){
      this.jobId = info.jobnumber;
      this.exitStatus = info.exit_status;
      this.failed = info.failed;
    }

    else{
      this.exitStatus = [];
      this.failed = [];
      for(let taskId in info){
        if(info.hasOwnProperty(taskId)){
          this.jobId = info[taskId]["jobnumber"];
          this.exitStatus.push(info[taskId]["exit_status"]);
          this.failed.push(info[taskId]["failed"]);
        }
      }
    }
    this.rawInfo = info;
  }
}