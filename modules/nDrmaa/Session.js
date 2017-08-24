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
    throw new UnsupportedOperationException("runJob() must be implemented in subclass");
  }
}