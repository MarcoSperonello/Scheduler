import {defer,when} from "promised-io/promise";

import SessionManagerBase from "../SessionManager";
import Version from "../Version";
import * as sge from "./sge-cli";

export default class SessionManager extends SessionManagerBase{

  constructor(){
    super("sge");
    this.ready = new defer();
    var _self=this;
    when(sge.getDrmsInfo(), (drmsInfo) => {
      console.log("SGE DRMAA Ready");
      _self.drmsName = drmsInfo.drmsName;
      _self.drmsVersion = drmsInfo.version;
      // _self.openMonitoringSession();
      _self.ready.resolve(true);
    });
  }

}