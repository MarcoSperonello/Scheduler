import {defer,when} from "promised-io/promise";
import SessionManagerBase from "../SessionManager";
import JobMonitor from "./JobMonitor";
import * as sge from "./sge-cli";
import Session from "./Session";
import * as Exception from "../Exceptions";

export default class SessionManager extends SessionManagerBase{

  constructor(){
    super();

    this.ready = new defer();
    this.jobsMonitor = new JobMonitor();
    this.SessionConstructor = Session;
    console.log("Loading DRMAA Libs for SGE");

    when(sge.getDrmsInfo(), (drmsInfo) => {
      console.log("SGE DRMAA Ready");
      this.drmsName = drmsInfo.drmsName;
      this.drmsVersion = drmsInfo.version;
      this.ready.resolve(true);
    }, (err) => {
      this.ready.reject(new Exception.DrmsInitException("Could not initialize SGE: check running status."));
    });
  }

}