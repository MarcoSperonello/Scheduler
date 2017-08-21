export default class JobTemplate {
  constructor(params){
    this.remoteCommand = "";
    this.args = [];
    this.nativeParams = "";
    this.submitAsHold = false;
    this.rerunnable = false;
    this.jobEnvironment = {};
    this.workingDirectory = "";
    this.jobCatgegory = "";
    this.email = [];
    this.emailOnStarted = false;
    this.emailOnTerminated = false;
    this.jobName = "";
    this.inputPath = "";
    this.outputPath = "";
    this.errorPath = "";
    this.joinFiles = "";
    this.reservationId = "";
    this.queueName = "";
    this.minSlots = null;
    this.maxSlots = null;
    this.priority = null;
    this.candidateMachines = [];
    this.minPhysMemory = null;
    this.machineOS = null;
    this.machineArch = null;
    this.startTime = null;
    this.deadlineTime = null;
    this.stageInFiles = {};
    this.stageOutFiles = {};
    this.resourceLimits = {};
    this.accountingId = "";

    if(params){
      for (var prop in params){
        this[prop]=params[prop];
      }
    }

    console.log("Created a job template: " + this.remoteCommand);
  }

};