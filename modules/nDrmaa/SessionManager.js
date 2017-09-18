import {when,defer} from "promised-io/promise";
import * as Exceptions from "./Exceptions";
import Version from "./Version";

let _Sessions = {};

/**
 * Class used to retrieve a Session object tailored to the DRM in use.
 */
export default class SessionManager{

  constructor(){
    // Make sure that this class can't be constructed directly but only through subclasses
    if (new.target === SessionManager) {
      throw new TypeError("Cannot construct SessionManager instances from its abstract class.");
    }

    this.ready = new defer();
    this.drmsName = "";                   // DRMS name
    this.drmsVersion = "";                // DRMS version
    this.drmaaName = "nDrmaa";            // DRMAA name
    this.jobsMonitor = null;              // Job's monitor
    this.SessionConstructor = null;       // Reference to the implementation of the DRMS-specific Session class

    // try {
    //   if (drmsName && typeof drmsName==='string') {
    //     console.log("Loading DRMS Libs for "+drmsName);
    //
    //     // importing the old way cause ES6 doesn't allow dynamic imports
    //     let DRMSSessionManager = require("./" + drmsName + "/SessionManager");
    //   }
    //
    // }catch(err){
    //   console.log("Unable to load DRMAA Lib for " + drmsName);
    // }

    return this;
  }

  createSession(sessionName, contact){
    return when(this.ready, () => {
      if (!sessionName) {
        throw new Exceptions.InvalidArgumentException("Session Name is a required parameter for 'createJobSession'");
      }
      if (_Sessions[sessionName]){
        throw new Exceptions.InvalidSessionArgument("A Session named '" + sessionName + "' already exists");
      }
      _Sessions[sessionName] = new this.SessionConstructor(sessionName, this.jobsMonitor, contact);

      return _Sessions[sessionName];
    });
  }

  getSession(sessionName){
    return when(this.ready, () => {
      if (!sessionName) {
        throw new Exceptions.InvalidArgumentException("Session Name is a required parameter for 'openJobSession'");
      }
      if (!_Sessions[sessionName]){
        throw new Exceptions.InvalidSessionException("Session with name '" + sessionName + "' not found.");
      }
      return _Sessions[sessionName];
    });
  }

  closeSession(sessionName){
    return when(this.ready, () => {
      if (!_Sessions[sessionName]) {
        throw new Exceptions.InvalidSessionException("Job Session with the name '" + sessionName + "' not found.");
      }
      delete _Sessions[sessionName];
    });
  };

  getVersion(){
    return when(this.ready, () => {
      return this.drmsVersion;
    });
  }
}