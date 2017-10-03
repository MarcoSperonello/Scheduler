import JobInfo from "../JobInfo";

/**
 * This class provides information about a completed Grid Engine job.
 * @extends JobInfo
 */
class JobInfoImpl extends JobInfo{
  /**
   * Inserts the info passed as argument based on the type of job we are dealing with (array or single)
   * @param {Object} info
   */
  constructor(info) {
    super();

    let isJobArrayResult = !info.jobnumber; // Whether we are dealing with the info of an array job

    if(!isJobArrayResult){
      // If we are dealing with a single job (or an array job with a single task)
      // just copy the resulting information in the corresponding fields
      this.jobId = info.jobnumber;
      this.exitStatus = info.exit_status;
      this.failed = info.failed;
    }

    else{
      // Otherwise, the properties "exitStatus" and "failed" become arrays where we push
      // the resulting exit statuses of each task belonging to the array job.
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

export default JobInfoImpl