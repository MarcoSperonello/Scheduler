import * as errors from 'restify-errors';
import plugins from 'restify-plugins';


import aux from './aux';

import Db from './database';
import {getRoutes} from './server';
import Sec from './scheduler-security';

import {when,defer} from "promised-io";
import JobTemplate from "./nDrmaa/JobTemplate";
import SessionManager from "./nDrmaa/sge/SessionManager";
import Job from "./nDrmaa/Job";

export default {

  handleRoot: function handleRoot(req, res, next) {
    req.log.info(`request handler is ${handleRoot.name}`);
    const routes = getRoutes();
    const ret_routes = {};
      for (let method in routes) {
        console.log("method " + method);
      if (routes.hasOwnProperty(method)) {
        ret_routes[method] = [];
        for (let i = 0; i < routes[method].length; i++) {
          let r = routes[method][i]['spec'];
          delete r['versions'];
          delete r['method'];
          ret_routes[method].push(r);
        }
      }
    }
    res.send(200, ret_routes);
    return next()
  },

  handleTest: function handleTest(req, res, next) {
      req.log.info(`request handler is ${handleTest.name}`);

      var requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      var requestData = {
        ip: requestIp,
        time: req.time()
      };
      Db.performInsertOne(requestData, "test");

      /*var cursor = Db.performFind({ ip: "::ffff:127.0.0.1" }, { ip: 1, time: 1}, "test");
      cursor.forEach( (docs) => {
          console.log(docs["time"]);
      }, (err) => {
          console.log("error");
      });*/

      console.log("req path " + req.path());

      res.send(200, "test");

      return next()
  },

  handleScheduler: function handleScheduler(req, res, next) {
      req.log.info(`request handler is ${handleScheduler.name}`);

      var requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      var requestData = {
          ip: requestIp,
          time: req.time()
      };

      Sec.handleRequest(requestData);
      //Sec.addJob(req.query["jobfile"]);
      //Sec.pollJobs("simple.sh");

      res.send(200, "done");

      return next()
  },

  handleSubmitJob: function handleSubmitJob(req, res, next) {
    req.log.info(`request handler is ${handleSubmitJob.name}`);

    var jobExample = new JobTemplate({
      remoteCommand:'/home/andrea/Documents/sge-tests/simple.sh',
      workingDirectory: '/home/andrea/Documents/sge-tests/',
      jobName: 'testJob',
      // submitAsHold: true
      nativeSpecification: '-now y'
    });

    var sm = new SessionManager();
    when(sm.createSession("ciccio"), (session) => {
      when(session.runJob(jobExample), (job) => {
        when(session.wait(job, session.TIMEOUT_WAIT_FOREVER), (jobInfo) => {
          console.log(jobInfo);
          if(jobInfo.failed === "0" && jobInfo.exit_status==="0")
            res.send(200, "Job " + job.jobId + " terminated execution with no errors");
          else
            res.send(500, "Job " + job.jobId + " terminated execution with errors");
        }, (err) => {
          res.send(500, "Job " + job.jobId + " encountered the following errors: " + err["error_reason"]);
        });

        sm.closeSession(session.sessionName);
      });
    });

    return next()
  }
}