import * as errors from 'restify-errors';

import aux from './aux';

// import Db from './database';
import fs from 'fs';
import Logger from './logger';
import {getRoutes,isMonitoring,setMonitor} from './server';
import {Sec, sessionManager} from "./scheduler/scheduler-manager";

import {when,defer,all} from "promised-io";
import JobTemplate from "./nDrmaa/JobTemplate";
import SessionManager from "./nDrmaa/sge/SessionManager";

let sm = new SessionManager();

fs.mkdir('./output/', (error) => {
  if (!error || error.code === 'EEXIST') {
    console.log('Created output folder.');
  } else {
    console.log('Error creating output folder');
  }
});

/**
 * Generates a UUID string.
 * @returns {string} The generated UUID string.
 */
function generateUUIDV4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function writeToFileSystem(folderName, fileName, input) {
  return new Promise( (resolve, reject) => {
    fs.mkdir('./output/' + folderName, (error) => {
      if (!error || error.code === 'EEXIST') {
        fs.writeFile('./output/' + folderName + '/' + fileName + '.json', JSON.stringify(input, null, '\t'), (error) => {
          resolve('Written file ./output/' + folderName + '/' + fileName + '.json');
          reject('Could not write file ./output/' + folderName + '/' + fileName + '.json: ' + error);
        })
      } else {
        reject('Error while making directory ' + folderName + ': ' + error);
      }
    });
  });
}


function issueRequest(requestData) {
  return new Promise( (resolve, reject) => {
    Sec.handleRequest(requestData).then( (status) => {
      writeToFileSystem(requestData.sessionName, 'Job ' + status.jobData.jobId + ' requestOutcome', status).then( (success) => {
        console.log(success);
      }, (error) => {
        console.log(error);
      });

      Sec.getJobResult(status.jobData.jobId, requestData.sessionName).then( (status) => {
        writeToFileSystem(requestData.sessionName, 'Job ' + status.jobId + ' jobStatusInformation', status).then( (success) => {
          console.log(success);
        }, (error) => {
          console.log(error);
        });
        resolve(status);
      }, (error) => {
        reject(error.description);
      });
    }, (error) => {
      reject(error.description);
    });
  });
}

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

  handleScheduler: function handleScheduler(req, res, next) {
    req.log.info(`request handler is ${handleScheduler.name}`);

    // Fetches the IP of the client who made the request.
    let requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    //console.log('req params ' + req.body.param1);
   /* let jobData = {
      remoteCommand: "\"/home/marco/Uni/Tesi/Projects/node-ws-template/sge-tests/simple.sh\"",
      workingDirectory: "/home/marco/Uni/Tesi/Projects/node-ws-template/sge-tests/",
      jobName: 'testJob',
      nativeSpecification: '',
      submitAsHold: false,
      start: 1,
      end: 0,
      incr: 1
    };*/

    let sessionName = generateUUIDV4();

    let requestData1 = {
      ip: requestIp,
      time: req.time(),
      jobPath: req.body[0],
      sessionName: sessionName,
    };
    let requestData2 = {
      ip: requestIp,
      time: req.time(),
      jobPath: req.body[1],
      sessionName: sessionName,
    };

    let requestData3 = {
      ip: requestIp,
      time: req.time(),
      jobPath: req.body[2],
      sessionName: sessionName,
    };

    sessionManager.createSession(sessionName).then(() => {
      let job1 = issueRequest(requestData1);
      let job2 = issueRequest(requestData2);

      Promise.all([job1, job2])
        .then((statuses) => {
          let errorsOccurred = false;
          let failedJobs = [];

          statuses.forEach((status) =>
          {
            if(status.mainStatus!=="COMPLETED" || status.subStatus==="DELETED")
            {
              errorsOccurred = true;
              failedJobs.push(status);
            }
          });

          if(!errorsOccurred)
          {
            issueRequest(requestData3)
              .then((status) => {
                sessionManager.closeSession(sessionName);
                res.send(200,status);
              }, (error) => {
                sessionManager.closeSession(sessionName);
                res.send(500,error);
              })
          }
          else
          {
            // sessionManager.closeSession(sessionName);
            res.send(500,failedJobs);
          }
        }, (error) => {
          // sessionManager.closeSession(sessionName);
          res.send(500, error);
        })
    }, (error) => {
      Logger.info('Could not create session ' + sessionName + ': ' + error);
      res.send(500,error);
    });

    /*sessionManager.createSession(requestData.sessionName).then( () => {
      issueRequest(requestData).then( (status) => {
        console.log('Job ' + status.jobId + ' of session ' + status.sessionName + ' status: ' + status.mainStatus + '-' + status.subStatus + ', exitCode: ' + status.exitStatus + ', failed: \"' + status.failed + '\", errors: ' + status.errors + ', description: ' + status.description);
        issueRequest(requestData).then( (status) => {
          console.log('Job ' + status.jobId + ' of session ' + status.sessionName + ' status: ' + status.mainStatus + '-' + status.subStatus + ', exitCode: ' + status.exitStatus + ', failed: \"' + status.failed + '\", errors: ' + status.errors + ', description: ' + status.description);
        }, (error) => {
          Logger.info('Error: ' + error);
        });
      }, (error) => {
        Logger.info('Error: ' + error);
      });
    }, (error) => {
      Logger.info('Could not create session ' + requestData.sessionName + ': ' + error);
    });*/


    //192.168.0.0 ([0-9])+(\.?([0-9])+)*
    //192.*

    //let regexp = new RegExp('([0-9])+(\\.?([0-9])+)*');
    //let str = '192.';
/*    let pattern = '192*';
    let regexp = new RegExp(pattern);
    let str = '192.168.0.1';
    console.log("test:" + regexp.test(str));*/

/*    let handleRequestPromise = Sec.handleRequest(requestData);
    handleRequestPromise.then( (status) => {
      console.log('hi ' + status.jobData.sessionName);
      Sec.getJobResult(status.jobData.jobId, status.jobData.sessionName).then( (status) => {
        console.log('Job ' + status.jobId + ' of session ' + status.sessionName + ' status: ' + status.mainStatus + '-' + status.subStatus + ', exitCode: ' + status.exitStatus + ', failed: \"' + status.failed + '\", errors: ' + status.errors + ', description: ' + status.description);
      })
    }, (error) => {
      Logger.info(error.description);
    });*/

    //Sec.addJob(req.query["jobfile"]);
    //Sec.pollJobs("simple.sh");
    //Sec.handleJobSubmission(requestData);

    return next()
  },

  handleSubmitJob: function handleSubmitJob(req, res, next) {
    req.log.info(`request handler is ${handleSubmitJob.name}`);

    var jobExample1 = new JobTemplate({
      remoteCommand:'simple.sh',
      workingDirectory: '/home/andrea/Documents/sge-tests/',
      jobName: 'testJob',
      // submitAsHold: true
      // nativeSpecification: '-now y'
    });

    var jobExample2 = new JobTemplate({
      remoteCommand:'simple2.sh',
      workingDirectory: '/home/andrea/Documents/sge-tests/',
      jobName: 'testJob2',
      // submitAsHold: true
      // nativeSpecification: '-now y'
    });


    // for(let i = 0; i < 50; i++) {
    //   let sessionName = "ciao" + i;
    //
    //   when(sm.createSession(sessionName), (session) => {
    //
    //     let jobsToRun = [];
    //
    //     // jobsToRun.push(session.runJob(jobExample2));
    //     // jobsToRun.push(session.runJob(jobExample1));
    //     jobsToRun.push(session.runBulkJobs(jobExample1, 1, 30));
    //     // jobsToRun.push(session.runBulkJobs(jobExample1, 40, -20, 11));
    //     // jobsToRun.push(session.runBulkJobs(jobExample1, 40, 20, -11));
    //
    //     let jobPromises = all(jobsToRun);
    //
    //     jobPromises.then((jobIds) => {
    //
    //       setTimeout(() => {
    //         when(session.synchronize([jobIds[0]]), (response) => {
    //           console.log(response);
    //         });
    //       }, Math.random()*(12000 - 10000)+10000);
    //     }, (err) => {
    //       console.log("Error runJob: " + err);
    //       res.send(500, err);
    //     });
    //
    //     sm.closeSession(session.sessionName);
    //   });
    // }

    for(let i = 0; i < 1; i++) {
      let sessionName = "ciao" + i;
      when(sm.createSession(sessionName), (session) => {
        let jobsToRun = [];
        jobsToRun.push(session.runBulkJobs(jobExample1, 1, 6));
        jobsToRun.push(session.runJob(jobExample2));
        // jobsToRun.push(session.runJob(jobExample2));
        let jobPromises = all(jobsToRun);

        jobPromises.then((jobIds) => {
          session.control(jobIds[0], session.TERMINATE);
          when(session.getJobProgramStatus([jobIds[0]]), (res) => {
            console.log(res);
          }, (err) => {
            console.log(err);
          })
          // when(session.synchronize(session.JOB_IDS_SESSION_ALL), (response) => {
          //   console.log(response);
          //   jobsToRun.push(session.runBulkJobs(jobExample1, 1, 6));
          //   jobsToRun.push(session.runJob(jobExample2));
          //   jobPromises = all(jobsToRun);
          //
          //   jobPromises.then((jobIds) => {
          //     when(session.synchronize(session.JOB_IDS_SESSION_ALL), (response) => {
          //       console.log(response);
          //     });
          //   });
          //
          // }, (err) => {
          //   console.log("Error synchronize: " + err);
          // });

        }, (err) => {
          console.log("Error runJob: " + err);
          res.send(500, err);
        });

        sm.closeSession(session.sessionName);
      });
    }



    /**
     * Example showing how to create a session, run a job and control it.
     */

    // when(sm.createSession("ciccio"), (session) => {
    //   when(session.runJob(jobExample1), (jobId) => {
    //
    //     setTimeout(() => {
    //       when(session.control(jobId, session.SUSPEND), (resp) => {
    //         console.log(resp);
    //         setTimeout(() => {
    //           when(session.control(jobId, session.RESUME), (resp) => {
    //             console.log(resp);
    //             setTimeout(() => {
    //               when(session.control(jobId, session.HOLD), (resp) => {
    //                 console.log(resp);
    //                 setTimeout(() => {
    //                   when(session.control(jobId, session.RELEASE), (resp) => {
    //                     console.log(resp);
    //                     setTimeout(() => {
    //                       when(session.control(jobId, session.TERMINATE), (resp) => {
    //                         res.send(200, resp);
    //                       }, (err) => {
    //                         res.send(500, err);
    //                       });
    //                     }, 2000);
    //                   }, (err) => {
    //                     res.send(500, err);
    //                   });
    //                 }, 4000);
    //               }, (err) => {
    //                 res.send(500, err);
    //               });
    //             }, 4000);
    //           }, (err) => {
    //             res.send(500, err);
    //           });
    //         }, 4000);
    //       }, (err) => {
    //         res.send(500, err);
    //       });
    //     }, 2000);
    //
    //   }, (err) => {
    //     res.send(500, err);
    //   });
    //   sm.closeSession(session.sessionName);
    // });




    /**
     * Example showing how to wait for a job's completion info.
     */

    // when(sm.createSession("pippo"), (session) => {
    //   when(session.runJob(jobExample1), (jobId) => {
    //     when(session.wait(jobId, session.TIMEOUT_WAIT_FOREVER), (jobInfo) => {
    //
    //       let statusCode, response;
    //
    //       if(jobInfo.jobStatus && jobInfo.jobStatus.mainStatus === "ERROR") {
    //         response = jobInfo;
    //         statusCode = 500;
    //       }
    //       else{
    //         response = "Job " + jobId + " terminated execution with exit status " + jobInfo.exitStatus ;
    //         if(jobInfo.failed !== "0")
    //           response += "; failed with code: " + jobInfo.failed ;
    //         statusCode = 200;
    //       }
    //       console.log(response);
    //       res.send(statusCode, response);
    //
    //     });
    //   }, (err) => {
    //     res.send(500, err);
    //   });
    //   sm.closeSession(session.sessionName);
    // });




    /**
     * Example showing how to start multiple jobs and how to control them
     * This example uses chained callbacks => bad practice. See next example
     * for a more correct practice.
     */

    // when(sm.createSession("pippo"), (session) => {
    //   when(session.runJob(jobExample1), (jobId1) => {
    //     when(session.runJob(jobExample2), (jobId2) => {
    //       when(session.runJob(jobExample1), (jobId3) => {
    //
    //         setTimeout(() => {
    //           when(session.control(session.JOB_IDS_SESSION_ALL, session.SUSPEND), (resp) => {
    //             console.log(resp);
    //             setTimeout(() => {
    //               when(session.control(session.JOB_IDS_SESSION_ALL, session.RESUME), (resp) => {
    //                 console.log(resp);
    //                 setTimeout(() => {
    //                   when(session.control(session.JOB_IDS_SESSION_ALL, session.HOLD), (resp) => {
    //                     console.log(resp);
    //                     setTimeout(() => {
    //                       when(session.control(session.JOB_IDS_SESSION_ALL, session.RELEASE), (resp) => {
    //                         console.log(resp);
    //                         setTimeout(() => {
    //                           when(session.control(session.JOB_IDS_SESSION_ALL, session.TERMINATE), (resp) => {
    //                             res.send(200, resp);
    //                           }, (err) => {
    //                             res.send(500, err);
    //                           });
    //                         }, 2000);
    //                       }, (err) => {
    //                         res.send(500, err);
    //                       });
    //                     }, 4000);
    //                   }, (err) => {
    //                     res.send(500, err);
    //                   });
    //                 }, 4000);
    //               }, (err) => {
    //                 res.send(500, err);
    //               });
    //             }, 4000);
    //           }, (err) => {
    //             res.send(500, err);
    //           });
    //         }, 2000);
    //
    //
    //
    //       }, (err) => {
    //         res.send(500, err);
    //       });
    //     }, (err) => {
    //       res.send(500, err);
    //     });
    //   }, (err) => {
    //     res.send(500, err);
    //   });
    //   sm.closeSession(session.sessionName);
    // });




    /**
     * Example showing how to avoid the chained callback hell,
     * as well as how to submit multiple jobs at once.
     */

    // let sessionPromise = sm.createSession("pippo");
    //
    // sessionPromise.then( (session)=>{
    //   let jobArray = [];
    //
    //   for(let i = 0; i<10; i++){
    //     if(i === 5) jobArray.push(session.runJob(jobExample2));
    //     else jobArray.push(session.runJob(jobExample1));
    //   }
    //
    //   let jobPromises = all(jobArray);
    //
    //   // jobIds is an array containing the ids of the submitted jobs.
    //   jobPromises.then((jobIds) => {
    //     when(session.synchronize(session.JOB_IDS_SESSION_ALL, session.TIMEOUT_WAIT_FOREVER), (response) => {
    //       res.send(200, response);
    //     }, (err) => {
    //       res.send(500, err);
    //     });
    //   }, (err) => {
    //     res.send(500,err);
    //   });
    //   sm.closeSession(session.sessionName);
    // });




    /**
     * Example showing how to use the synchronize function to wait for jobs completion.
     */

    // when(sm.createSession("pippo"), (session) => {
    //   when(session.runJob(jobExample1), (jobId1) => {
    //     when(session.runJob(jobExample2), (jobId2) => {
    //       when(session.runJob(jobExample1), (jobId3) => {
    //
    //         when(session.synchronize(session.JOB_IDS_SESSION_ALL, session.TIMEOUT_WAIT_FOREVER), (response) => {
    //           res.send(200, response);
    //
    //
    //         }, (err) => {
    //           res.send(500, err);
    //         });
    //
    //
    //       }, (err) => {
    //         res.send(500, err);
    //       });
    //     }, (err) => {
    //       res.send(500, err);
    //     });
    //   }, (err) => {
    //     res.send(500, err);
    //   });
    //   sm.closeSession(session.sessionName);
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