import SessionManager from "../SessionManager";
import JobMonitor from "./JobMonitor";
import * as sge from "./sge-cli";
import Session from "./Session";
import * as Exception from "../Exceptions";

/**
 * Implementation of class SessionManager for SGE.
 * @extends SessionManager
 */
class SessionManagerImpl extends SessionManager{
  /**
   * Retrieves the version of SGE and initializes SessionManager.
   * Parameter "ready" is a promise that is resolved only if we were able
   * to retrieve SGE version, and it used as a ready check in all the
   * methods of the base class.
   */
  constructor(){
    super();
    console.log("Loading DRMAA Libs for SGE");
    this.ready = new Promise((resolve, reject) => {
      sge.getDrmsInfo()
        .then((drmsInfo) => {
          console.log("SGE DRMAA Ready");
          this.jobsMonitor = new JobMonitor();
          this.SessionConstructor = Session;
          this.drmsName = drmsInfo.drmsName;
          this.drmsVersion = drmsInfo.version;
          resolve(true);
        })
        .catch(() => {
          reject(new Exception.DrmsInitException("Could not initialize SGE: check running status."));
        });
    });

  }

}

export default SessionManagerImpl;