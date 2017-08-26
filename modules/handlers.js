import * as errors from 'restify-errors';

import aux from './aux';

// import Db from './database';
import {getRoutes,isMonitoring,setMonitor} from './server';
import {spawn} from 'child_process';
import fs from 'fs';


import * as sge from "./nDrmaa/sge/sge-cli";
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
      if (routes.hasOwnProperty(method)) {
        ret_routes[method] = [];
        for (let i = 0; i < routes[method].length; i++) {
          let r = routes[method][i]['spec'];
          delete r['versions'];
          delete r['method'];
          ret_routes[method].push(r)
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

    let sm = new SessionManager();

    when(sm.createSession("ciccio"), (session) => {
      when(session.runJob(jobExample), (jobId) => {

        setTimeout(() => {
          when(session.control(jobId, session.SUSPEND), (resp) => {
            console.log(resp);
            setTimeout(() => {
              when(session.control(jobId, session.RESUME), (resp) => {
                console.log(resp);
                setTimeout(() => {
                  when(session.control(jobId, session.HOLD), (resp) => {
                    console.log(resp);
                    setTimeout(() => {
                      when(session.control(jobId, session.RELEASE), (resp) => {
                        console.log(resp);
                        setTimeout(() => {
                          when(session.control(jobId, session.TERMINATE), (resp) => {
                            res.send(200, resp);
                          }, (err) => {
                            res.send(500, err);
                          });
                        }, 2000);
                      }, (err) => {
                        res.send(500, err);
                      });
                    }, 4000);
                  }, (err) => {
                    res.send(500, err);
                  });
                }, 4000);
              }, (err) => {
                res.send(500, err);
              });
            }, 4000);
          }, (err) => {
            res.send(500, err);
          });
        }, 2000);

      }, (err) => {
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

    return next()
  }
}