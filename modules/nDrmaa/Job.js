import {EventEmitter} from "events";
import {UnsupportedOperationException} from "./Exceptions";

/**
 * Class representing a Job
 */
export default class Job{
  constructor(jobId, sessionName, jobTemplate, isJobArray, jobArrayStart, jobArrayEnd, jobArrayIncr){
    this.jobId = jobId;
    // this.jobStatus="UNDETERMINED";
    this.sessionName = sessionName;
    this.jobTemplate = jobTemplate;
    this.isJobArray = isJobArray || false;
    this.jobArrayStart = parseInt(jobArrayStart) || null;
    this.jobArrayEnd = parseInt(jobArrayEnd) || null;
    this.jobArrayIncr = parseInt(jobArrayIncr) || null;
    console.log("Created job:" + this.jobId + ", "+this.sessionName+", "+this.jobTemplate);
    if(this.isJobArray) console.log("Array job params: start " + jobArrayStart + ", end " + jobArrayEnd + ", incr " + jobArrayIncr);
  }
}