import * as Exception from "./Exceptions";

export default class Session{
  constructor(sessionName,contact,jobCategories){
    this.jobs = [];
    this.sessionName = sessionName;
    this.contact = contact;
    this.jobCategories = jobCategories || [];
  }

  getJobs(){
    return this.jobs;
  }

  getJobArray(){

  }

  runJob(jobTemplate){
    if (!(jobTemplate instanceof JobTemplate)){
      throw new exceptions.InvalidArgumentException("Job Template must be an instance of JobTemplate");
    }

    let job = new Job(null,this.sessionName,jobtemplate);
    this.jobs.push(job);
    return job;
  },
}