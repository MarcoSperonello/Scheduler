import {when,defer} from "promised-io/promise";
import * as Exception from "./Exceptions";

/**
 * Class used to manage objects of class Session, tailored to the DRMS in use.
 */

let _Sessions = {};                       // List of active sessions created by the SessionManager

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

    return this;
  }

  /**
   * Creates a new Session with name sessionName
   * @param sessionName: name of the session to create
   * @param contact: contact info.
   * @returns {Session}: the session created
   */
  createSession(sessionName, contact){
    return when(this.ready, () => {
      if (!sessionName) {
        throw new Exception.InvalidArgumentException("Session Name is a required parameter for 'createJobSession'");
      }
      if (_Sessions[sessionName]){
        throw new Exception.InvalidSessionArgument("A Session named '" + sessionName + "' already exists");
      }
      _Sessions[sessionName] = new this.SessionConstructor(sessionName, this.jobsMonitor, contact);

      return _Sessions[sessionName];
    });
  }

  /**
   * Retrieve the session identified by sessionName
   * @param sessionName: the name of the session to retrieve
   * @returns {Session}: the session retrieved
   */
  getSession(sessionName){
    return when(this.ready, () => {
      if (!sessionName) {
        throw new Exception.InvalidArgumentException("Session Name is a required parameter for 'openJobSession'");
      }
      if (!_Sessions[sessionName]){
        throw new Exception.InvalidSessionException("Session with name '" + sessionName + "' not found.");
      }
      return _Sessions[sessionName];
    });
  }

  /**
   * Closes the session identified by sessionName
   * @param sessionName: the name of the session to close
   */
  closeSession(sessionName){
    return when(this.ready, () => {
      if (!_Sessions[sessionName]) {
        throw new Exception.InvalidSessionException("Job Session with the name '" + sessionName + "' not found.");
      }
      delete _Sessions[sessionName];
    });
  };

  /**
   * Returns the version of the DRMS in use
   * @returns {Version}: an object of class Version that contains the version of the DRMS
   */
  getVersion(){
    return when(this.ready, () => {
      return this.drmsVersion;
    });
  }
}