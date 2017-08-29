'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _restifyErrors = require('restify-errors');

var errors = _interopRequireWildcard(_restifyErrors);

var _aux = require('./aux');

var _aux2 = _interopRequireDefault(_aux);

var _server = require('./server');

var _schedulerSecurity = require('./scheduler-security');

var _schedulerSecurity2 = _interopRequireDefault(_schedulerSecurity);

var _sgeCli = require('./nDrmaa/sge/sge-cli');

var sge = _interopRequireWildcard(_sgeCli);

var _promisedIo = require('promised-io');

var _JobTemplate = require('./nDrmaa/JobTemplate');

var _JobTemplate2 = _interopRequireDefault(_JobTemplate);

var _SessionManager = require('./nDrmaa/sge/SessionManager');

var _SessionManager2 = _interopRequireDefault(_SessionManager);

var _Job = require('./nDrmaa/Job');

var _Job2 = _interopRequireDefault(_Job);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

exports.default = {

  handleRoot: function handleRoot(req, res, next) {
    req.log.info('request handler is ' + handleRoot.name);

    var routes = (0, _server.getRoutes)();
    var ret_routes = {};
    for (var method in routes) {
      if (routes.hasOwnProperty(method)) {
        ret_routes[method] = [];
        for (var i = 0; i < routes[method].length; i++) {
          var r = routes[method][i]['spec'];
          delete r['versions'];
          delete r['method'];
          ret_routes[method].push(r);
        }
      }
    }

    res.send(200, ret_routes);
    return next();
  },

  handleScheduler: function handleScheduler(req, res, next) {
    req.log.info('request handler is ' + handleScheduler.name);

    // Fetches the IP of the client who made the request.
    var requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    // Loads request information.
    var requestData = {
      ip: requestIp,
      time: req.time(),
      jobPath: req.query["jobPath"]
    };

    // Calls the request handler.
    _schedulerSecurity2.default.handleRequest(requestData);
    //Sec.addJob(req.query["jobfile"]);
    //Sec.pollJobs("simple.sh");
    //Sec.handleJobSubmission(requestData);

    res.send(200, "Done\r\n");

    return next();
  },

  handleSubmitJob: function handleSubmitJob(req, res, next) {
    req.log.info('request handler is ' + handleSubmitJob.name);

    var jobExample = new _JobTemplate2.default({
      remoteCommand: '/home/andrea/Documents/sge-tests/simple.sh',
      workingDirectory: '/home/andrea/Documents/sge-tests/',
      jobName: 'testJob',
      // submitAsHold: true
      nativeSpecification: '-now y'
    });

    var sm = new _SessionManager2.default();

    (0, _promisedIo.when)(sm.createSession("ciccio"), function (session) {
      (0, _promisedIo.when)(session.runJob(jobExample), function (jobId) {

        setTimeout(function () {
          (0, _promisedIo.when)(session.control(jobId, session.SUSPEND), function (resp) {
            console.log(resp);
            setTimeout(function () {
              (0, _promisedIo.when)(session.control(jobId, session.RESUME), function (resp) {
                console.log(resp);
                setTimeout(function () {
                  (0, _promisedIo.when)(session.control(jobId, session.HOLD), function (resp) {
                    console.log(resp);
                    setTimeout(function () {
                      (0, _promisedIo.when)(session.control(jobId, session.RELEASE), function (resp) {
                        console.log(resp);
                        setTimeout(function () {
                          (0, _promisedIo.when)(session.control(jobId, session.TERMINATE), function (resp) {
                            res.send(200, resp);
                          }, function (err) {
                            res.send(500, err);
                          });
                        }, 2000);
                      }, function (err) {
                        res.send(500, err);
                      });
                    }, 4000);
                  }, function (err) {
                    res.send(500, err);
                  });
                }, 4000);
              }, function (err) {
                res.send(500, err);
              });
            }, 4000);
          }, function (err) {
            res.send(500, err);
          });
        }, 2000);
      }, function (err) {
        res.send(500, err);
      });
      sm.closeSession(session.sessionName);
    });

    // when(sm.createSession("pippo"), (session) => {
    //   when(session.runJob(jobExample), (jobId) => {
    //     when(session.wait(jobId, session.TIMEOUT_WAIT_FOREVER), (jobInfo) => {
    //
    //       let response = "Job " + jobId + " terminated execution with exit status " + jobInfo.exitStatus ;
    //
    //       if(jobInfo.failed !== "0")
    //         response += "; failed with code: " + jobInfo.failed ;
    //
    //       res.send(200, response);
    //
    //     }, (err) => {
    //       res.send(500, err);
    //     });
    //
    //
    //   }, (err) => {
    //     res.send(500, err);
    //     sm.closeSession(session.sessionName);
    //   });
    // });

    return next();
  },

  handleFoo: function handleFoo(req, res, next) {
    req.log.info('request handler is ' + handleFoo.name);

    var args = [
    //'-l', 'h_rt=00:00:01',  //set maximum run time (aborts job after 1 second of running time)
    '-sync', 'y', '/home/andrea/Documents/sge-tests/simple.sh' //script file path
    ];

    var options = {
      cwd: '/home/andrea/Documents/sge-tests/',
      env: process.env
    };

    /*
    const qsub = spawn('qsub',args,options);
     qsub.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
      res.send(200, "Task submitted");
       // if(!isMonitoring())
      // {
      //   setMonitor(true);
      //   setInterval(function(){
      //     const qstat = spawn('qstat');
      //
      //     qstat.stdout.on('data', (data) => {
      //       console.log(`stdout: ${data}`);
      //     });
      //   },1000);
      // }
     });
     qsub.on('close', (code) => {
      console.log(`child ended with code ${code}`);
    });
     qsub.stderr.on('data', (data) => {
      var errorMsg = "Error:"  + data;
      res.send(500, errorMsg);
      console.log(`error: ${data}`);
    });
    */

    return next();
  }
};

// import Db from './database';