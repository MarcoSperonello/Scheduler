/**
 * @fileoverview Abstract class used to create and manage objects of class Session, tailored to the DRMS in use.
 *
 * @author Andrea Gallina
 */

import * as Exception from "./Exceptions";

let _Sessions = {};                       // List of active sessions created by the SessionManager

/**
 * Abstract class used to create and manage objects of class Session, tailored to the DRMS in use.
 */
class SessionManager{
  /**
   * Initialize an empty session manager
   * @return {SessionManager}
   */
  constructor(){
    // Make sure that this class can't be constructed directly but only through subclasses
    if (new.target === SessionManager) {
      throw new TypeError("Cannot construct SessionManager instances from its abstract class.");
    }

    /**
     * DRMS name.
     * @type {string}
     */
    this.drmsName = "";

    /**
     * DRMS version.
     * @type {string}
     */
    this.drmsVersion = "";

    /**
     * Job's monitor
     * @type {JobMonitor}
     */
    this.jobsMonitor = null;

    /**
     * Reference to the implementation of the DRMS-specific Session class
     * @type {Session}
     */
    this.SessionConstructor = null;

    return this;
  }

  /**
   * Creates a new Session with name sessionName
   * @param sessionName: name of the session to create
   * @param contact: contact info.
   * @return {Promise} Promise returning the created session.
   * @throws {module:nDrmaaExceptions.InvalidArgumentException} InvalidArgumentException - Caller did not specify
   *    a session name
   * @throws {module:nDrmaaExceptions.AlreadyActiveSessionException} AlreadyActiveSessionException - Tried to create
   *    a session with a name that is already in use by another session
   */
  createSession(sessionName, contact){
    return this.ready.then(() => {
      if (!sessionName) {
        throw new Exception.InvalidArgumentException("Must provide a session's name for method 'createSession'");
      }
      if (_Sessions[sessionName]){
        throw new Exception.AlreadyActiveSessionException("A Session named '" + sessionName + "' already exists");
      }
      _Sessions[sessionName] = new this.SessionConstructor(sessionName, this.jobsMonitor, contact);

      return _Sessions[sessionName];
    });
  }

  /**
   * Retrieve the session identified by sessionName
   * @param {string} sessionName - The name of the session to retrieve
   * @return {Promise} Promise returning the session retrieved
   * @throws {module:nDrmaaExceptions.InvalidArgumentException} InvalidArgumentException - Caller did not specify a
   *    session name
   * @throws {module:nDrmaaExceptions.NoActiveSessionException} NoActiveSessionException - Tried to retrieve a
   *    non-existent session
   */
  getSession(sessionName){
    return this.ready.then(() => {
      if (!sessionName) {
        throw new Exception.InvalidArgumentException("Must provide a session's name for method 'getSession'");
      }
      if (!_Sessions[sessionName]){
        throw new Exception.NoActiveSessionException("Session with name '" + sessionName + "' not found.");
      }
      return _Sessions[sessionName];
    });
  }

  /**
   * Closes the session identified by sessionName
   * @param {string} sessionName - Name of the session to close
   * @throws {module:nDrmaaExceptions.NoActiveSessionException} NoActiveSessionException - Tried to close a
   *    non-existent session.
   */
  closeSession(sessionName){
    return this.ready.then(() => {
      if (!_Sessions[sessionName]) {
        throw new Exception.NoActiveSessionException("Session with name '" + sessionName + "' not found.");
      }
      delete _Sessions[sessionName];
    });
  };

  /**
   * Returns the version of the DRMS in use
   * @return {Promise} Promise that returns an object of class Version containing the version of the DRMS
   */
  getVersion(){
    return this.ready.then(() => {
      return this.drmsVersion;
    });
  }
}

export default SessionManager;