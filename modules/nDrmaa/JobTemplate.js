/**
 * Class representing a Job Template.
 * @see http://gridscheduler.sourceforge.net/htmlman/htmlman3/drmaa_attributes.html
 */
export default class JobTemplate {
  constructor(params){
    /**
     * Specifies the remote command to execute. The  remote_command
     * must  be  the path of an executable that is available at the
     * job's execution host.   If  the  path  is  relative,  it  is
     * assumed to be relative to the working directory, usually set
     * through the drmaa_wd attribute.  If working directory is not
     * set,  the  path is assumed to be relative to the user's home
     * directory.
     *
     * The file pointed to by remote_command may either be an  exe-
     * cutable  binary  or  an  executable script.  If a script, it
     * must include the path to the shell  in  a  #!  line  at  the
     * beginning  of  the  script.
     *
     * @type {string}
     */
    this.remoteCommand = "";

    /**
     * Specifies the arguments to the job.
     * Specify like '[arg1, arg2, ...]'
     * @type {Array}
     */
    this.args = ["pippo", 2];

    /**
     * Specifies whether or not the job should be submitted as hold.
     * @type {boolean}
     */
    this.submitAsHold = false;

    /**
     * Specifies  the  job  environment.  Each  environment   value
     * defines  the  remote  environment.  The  value overrides the
     * remote environment values if there is a collision.
     * Specify like '{a:20, b:40, c:""}'
     * @type {JSON}
     */
    this.jobEnvironment = {};

    /**
     * Specifies the directory name where the job will be executed.
     * If not set,  the  working directory will default to the
     * user's home directory.
     *
     * @type {string}
     */
    this.workingDirectory = "";

    /**
     * Specifies Sun Grid Engine native qsub options which  will
     * be  interpreted  as  part  of  the  DRMAA job template.
     * All options available to qsub command  may  be  used  in  the
     * native_specification,  except for -help, -sync, -t, -verify,
     * and -w.
     * @type {string}
     */
    this.nativeSpecification = "";

    /**
     * Specifies e-mail addresses that are used to report  the  job
     * completion and status.
     * @type {[string]}
     */
    this.email = [];

    /**
     * Specifies whether e-mail sending shall blocked or  not.
     * @type {boolean}
     */
    this.blockEmail = true;

    /**
     * Specifies the earliest time when the job may be eligible  to
     * be run.
     * The time format is [[[[CC]YY/]MM/]DD] hh:mm[:ss] [{-|+}UU:uu]
     * where:
     *  - CC is the first two digits of the year (century-1)
     *  - YY is the last two digits of the year
     *  - MM is the two digits of the month [01,12]
     *  - DD is the two digit day of the month [01,31]
     *  - hh is the two digit hour of the day [00,23]
     *  - mm is the two digit minute of the day [00,59]
     *  - ss is the two digit second of the minute [00,61]
     *  - UU is the two digit hours since (before) UTC
     *  - uu is the two digit minutes since (before) UTC
     * @type {string}
     */
    this.startTime = '';

    /**
     * Specifies the job's name. Setting the job name is equivalent
     * to use of qsub submit option '-N' followed by the job name.
     * @type {string}
     */
    this.jobName = "";

    /**
     * Specifies the standard input of the job.  Unless  set  else-
     * where, if not explicitly set in the job template, the job is
     * started with an empty input stream.
     * @type {string}
     */
    this.inputPath = "";

    /**
     * Specifies the standard output of the job. If not  explicitly
     * set in the job template, the whereabouts of the job's output
     * stream is not defined. If set, this attribute specifies  the
     * network path of the job's output stream file.
     * @type {string}
     */
    this.outputPath = "";

    /**
     * Specifies the standard error of the job. If  not  explicitly
     * set  in the job template, the whereabouts of the job's error
     * stream is not defined. If set, this attribute specifies  the
     * network path of the job's error stream file.
     * @type {string}
     */
    this.errorPath = "";

    /**
     * Specifies if the job's error  stream  should  be  intermixed
     * with  the  output  stream.  If not explicitly set in the job
     * template the attribute defaults to 'n'. Either  'y'  or  'n'
     * can  be  specified.
     * @type {string}
     */
    this.joinFiles = "";

    // Parses the input params if the class is instantiated by passing an object with corresponding values
    if(params){
      for (let prop in params){
        if(this[prop]!==undefined)
          this[prop]=params[prop];
        else
          console.log("Ignoring property '"+prop+"' since it does not belong to JobTemplate.");
      }
    }

    console.log("Created a job template: " + this.remoteCommand);
  }

};