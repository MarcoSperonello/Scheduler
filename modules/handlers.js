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
  },

  handleFoo: function handleFoo(req, res, next) {
    req.log.info(`request handler is ${handleFoo.name}`);

    const args = [
      //'-l', 'h_rt=00:00:01',  //set maximum run time (aborts job after 1 second of running time)
      '-sync', 'y',
      '/home/andrea/Documents/sge-tests/simple.sh'  //script file path
    ];

    const options = {
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



    return next()
  }
}