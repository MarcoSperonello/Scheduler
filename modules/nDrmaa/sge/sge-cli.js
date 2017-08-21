import {exec} from "child_process";
import {defer} from "promised-io/promise";
import Version from "../Version";

export function getDrmsInfo() {
  let def = new defer();
  exec("qstat -help", (error, stdout, stderr) => {
    if (error) {
      def.reject(err);
      return;
    }
    let data = stdout.split("\n")[0].split(" ");
    let res = {drmsName: data[0]}
    let vparts = data[1].split(".");
    res.version = new Version(vparts[0],vparts[1]);
    def.resolve(res);
  });
  return def.promise;
}