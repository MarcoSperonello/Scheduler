/**
 * Class representing a Job Template. The attributes are defined according to the specifications found at
 * http://gridscheduler.sourceforge.net/htmlman/htmlman3/drmaa_attributes.html
 * NOTE: The options -help,  -sync,  -t,  -verify,  and  -w  w|v  are not supported, as specified on that page.
 */
export default class JobTemplate {
  constructor(params){
    this.remoteCommand = "";
    this.args = ["pippo", 2]; // specify like "[arg1, arg2, ...]"
    this.submitAsHold = false;
    this.jobEnvironment = { a:20, b:40, c:""};
    this.workingDirectory = "";
    this.jobCategory = "";
    this.nativeSpecification = "";
    this.email = ["andrea.gallina.2@studenti.unipd.it"];
    this.blockEmail = true;
    this.startTime = '';
    this.jobName = "";
    this.inputPath = "";
    this.outputPath = "";
    this.errorPath = "";
    this.joinFiles = "";
    this.transferFiles = "";

    if(params){
      for (var prop in params){
        this[prop]=params[prop];
      }
    }

    console.log("Created a job template: " + this.remoteCommand);
  }

};