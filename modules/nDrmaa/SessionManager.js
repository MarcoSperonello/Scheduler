import {when,defer} from "promised-io/promise";
import exceptions from "./Exceptions";
import Version from "./Version";

let _JobSessions = {}
let _MonitoringSessions = {}

export default class SessionManager{
  constructor(drmsName){
    this.drmsName = "efef";
    this.drmsVersion = "";
    this.drmaaName = "nDrmaa";
    try {
      if (drmsName && typeof drmsName==='string') {
        console.log("Loading DRMS Libs for "+drmsName);

        // importing the old way cause ES6 doesn't allow dynamic imports
        let DRMSSessionManager = require("./" + drmsName + "/SessionManager");
      }

    }catch(err){
      console.log("Unable to load DRMAA Lib for " + drmsName);
    }

    return this;
  }

  createSession(sessionName, contact){
    let _self=this;
    when(this.ready, function(){
      if (!sessionName) {
        throw new exceptions.InvalidArgumentException("Session Name is a required parameter for 'createJobSession'");
      }
      if (_JobSessions[sessionName]){
        throw new exceptions.InvalidSessionArgument("A Job Session with the name '" + sessionName + "' already exists");
      }
      _JobSessions[sessionName] = "ciccio";
    });
  }

  test(){
    let def = new defer();
    setTimeout(function(){
      console.log("Timer expired");
      def.reject(5);
    }, 3000);
    return def.promise;
  }
}