import {EventEmitter} from "events";
import {UnsupportedOperationException} from "./Exceptions";

export default class Job{
  constructor(jobId, sessionName, jobTemplate){
    this.jobId=jobId;
    this.sessionName = sessionName;
    this.jobTemplate = jobTemplate;
    console.log("Created job:" + this.jobId + ", "+this.sessionName+", "+this.jobTemplate);
  }

  suspend(){
    throw new UnsupportedOperationException("suspend() must be implemented in subclass");
  }

  resume(){
    throw new UnsupportedOperationException("resume() must be implemented in subclass");
  }

  hold(){
    throw new UnsupportedOperationException("hold() must be implemented in subclass");
  }

  release(){
    throw new UnsupportedOperationException("release() must be implemented in subclass");
  }

  terminate(){
    throw new UnsupportedOperationException("terminate() must be implemented in subclass");
  }

  getState(jobSubState){
    throw new UnsupportedOperationException("getState() must be implemented in subclass");
  }

  getInfo(){
    throw new UnsupportedOperationException("getInfo() must be implemented in subclass");
  }
}