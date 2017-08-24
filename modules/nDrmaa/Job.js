import {EventEmitter} from "events";
import {UnsupportedOperationException} from "./Exceptions";

export default class Job{
  constructor(jobId, sessionName, jobTemplate){
    this.jobId=jobId;
    this.sessionName = sessionName;
    this.jobTemplate = jobTemplate;
    console.log("Created job:" + this.jobId + ", "+this.sessionName+", "+this.jobTemplate);
  }
}