import * as errors from 'restify-errors';

import aux from './aux';

// import Db from './database';
import fs from 'fs';
import Logger from './logger';
import {getRoutes} from './server';
import {Scheduler, sessionManager} from "./scheduler/scheduler-manager";

import JobTemplate from "./nDrmaa/JobTemplate";
import SessionManager from "./nDrmaa/sge/SessionManager";

let sm = new SessionManager();


makeOutputDirectories('./output/','tap-output').then( () => {
}, (error) => {
  console.log(error);
});

makeOutputDirectories('./output/','dummy-output').then( () => {
}, (error) => {
  console.log(error);
});

makeOutputDirectories('./output/','frst-output').then( () => {
}, (error) => {
  console.log(error);
});

function makeOutputDirectories(path, subPath) {
  return new Promise( (resolve, reject) => {
    fs.mkdir(path, (error) => {
      if (!error || error.code === 'EEXIST') {
        //console.log('Created ' + path + ' folder.');
        fs.mkdir(path + subPath, (error) => {
          if (!error || error.code === 'EEXIST') {
            //console.log('Created ' + subPath + ' folder.');
            resolve();
          } else {
            console.log('Error creating ' + subPath + ' folder');
            reject(error);
          }
        });
      } else {
        console.log('Error creating ' + path + ' folder');
        reject(error);
      }
    });
  });
}

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
    //fs.mkdir('./output/' + folderName, (error) => {
    //makeOutputDirectories('./output', (error) => {
    makeOutputDirectories('./output/', folderName).then( () => {
        fs.writeFile('./output/' + folderName + '/' + fileName + '.json', JSON.stringify(input, null, '\t'), (error) => {
          if (!error || error.code === 'EEXIST') {
            resolve('Written file ./output/' + folderName + '/' + fileName + '.json');
          } else {
            reject('Could not write file ./output/' + folderName + '/' + fileName + '.json: ' + error);
          }
        });
    }, (error) => {
      reject('Error while making directory ' + folderName + ': ' + error);
    });
  });
}


 function issueRequest(requestData, session) {
   return new Promise( (resolve, reject) => {
     Scheduler.handleRequest(requestData, session).then( (status) => {
       writeToFileSystem('dummy-output/' + session.sessionName, 'Job ' + status.jobData.jobId + ' requestOutcome', status).then( (success) => {
         console.log(success);
       }, (error) => {
         console.log(error);
       });

       Scheduler.getJobResult(status.jobData.jobId, session).then( (status) => {
         writeToFileSystem('dummy-output/' + session.sessionName, 'Job ' + status.jobId + ' jobStatusInformation', status).then( (success) => {
           console.log(success);
         }, (error) => {
           console.log(error);
         });
         resolve(status);
       }, (error) => {
         reject(error);
       });
     }, (error) => {
       reject(error);
     });
   });
 }

function issuePdbRequest(requestData, session, filePath, fileName) {
  return new Promise( (resolve, reject) => {
    Scheduler.handleRequest(requestData, session).then( (status) => {
      fs.readFile(filePath, (error, data) => {
        if (error) {
          console.log('Error reading file ' + filePath + ': ' + error);
        } else {
          fs.mkdir('./output/tap-output/' + session.sessionName, (error) => {
            if (!error || error.code === 'EEXIST') {
              fs.writeFile('./output/tap-output/' + session.sessionName + '/' + fileName, data, (error) => {
                if (error) {
                  console.log('Error writing file ' + fileName + ': ' + error);
                }
                else console.log('Written file ' + fileName);
              });
            } else {
              console.log('Error creating ./output/tap-output/' + session.sessionName + ' folder: ' + error);
            }
          });
        }
      });

      Scheduler.getJobResult(status.jobData.jobId, session).then( (status) => {
        let jobResult = {};
        jobResult['status'] = status;
        if(status.mainStatus === 'ERROR' || status.mainStatus === 'COMPLETED' && status.subStatus === 'DELETED') {
          reject(jobResult);
          return;
        }

        fs.readFile('./output/tap-output/' + status.sessionName + '/' + status.jobName + '.o' + status.jobId, 'utf8', (error, data) => {
          if (error) {
            console.log('Error reading file ' + status.jobName + '.o' + status.jobId);
            reject({errors: error});
          } else {
            jobResult['output'] = data;
            if (status.exitStatus !== '0') {
              fs.readFile('./output/tap-output/' + status.sessionName + '/' + status.jobName + '.e' + status.jobId, 'utf8', (error, data) => {
                if (error) {
                  console.log('Error reading file ' + status.jobName + '.e' + status.jobId);
                  reject({errors: error});
                } else {
                  jobResult['errors'] = data;
                  reject(jobResult);
                }
              });
            } else {
              jobResult['resOut'] = fileName + '.res.out';
              resolve(jobResult);
            }
          }
        });
      }, (error) => {
        reject({errors: error.errors});
      });
    }, (error) => {
      reject({errors: error.errors});
    });
  });
}

function issueFrstRequest(requestData, session, filePath, fileName) {
  return new Promise( (resolve, reject) => {
    Scheduler.handleRequest(requestData, session).then( (status) => {
      fs.readFile(filePath, (error, data) => {
        if (error) {
          console.log('Error reading file ' + filePath + ': ' + error);
        } else {
          fs.mkdir('./output/frst-output/' + session.sessionName, (error) => {
            if (!error || error.code === 'EEXIST') {
              fs.writeFile('./output/frst-output/' + session.sessionName + '/' + fileName, data, (error) => {
                if (error) {
                  console.log('Error writing file ' + fileName + ': ' + error);
                }
                else console.log('Written file ' + fileName);
              });
            } else {
              console.log('Error creating ./output/frst-output/' + session.sessionName + ' folder: ' + error);
            }
          });
        }
      });

      Scheduler.getJobResult(status.jobData.jobId, session).then( (status) => {
        let jobResult = {};
        jobResult['status'] = status;
        if(status.mainStatus === 'ERROR' || status.mainStatus === 'COMPLETED' && status.subStatus === 'DELETED') {
          reject(jobResult);
          return;
        }

        fs.readFile('./output/frst-output/' + status.sessionName + '/' + status.jobName + '.o' + status.jobId, 'utf8', (error, data) => {
          if (error) {
            console.log('Error reading file ' + status.jobName + '.o' + status.jobId);
            reject({errors: error});
          } else {
            jobResult['output'] = data;
            if (status.exitStatus !== '0') {
              fs.readFile('./output/frst-output/' + status.sessionName + '/' + status.jobName + '.e' + status.jobId, 'utf8', (error, data) => {
                if (error) {
                  console.log('Error reading file ' + status.jobName + '.e' + status.jobId);
                  reject({errors: error});
                } else {
                  jobResult['errors'] = data;
                  reject(jobResult);
                }
              });
            } else {
              jobResult['outputFile'] = 'frst.pdb';
              resolve(jobResult);
            }
          }
        });
      }, (error) => {
        reject({errors: error.errors});
      });
    }, (error) => {
      reject({errors: error.errors});
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

  handleTapJobSubmission: function handleTapJobSubmission(req, res, next) {
    req.log.info(`request handler is ${handleTapJobSubmission.name}`);
    let requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    let sessionName = generateUUIDV4();

    let jobTemplate = {};
    try{
      jobTemplate = JSON.parse(req.body.jobTemplate);
    } catch(e) {
      res.send(500, e);
      return next();
    }

    jobTemplate.args[1] = req.files.file.path;
    jobTemplate.args[3] = '../../output/tap-output/' + sessionName + '/' + req.files.file.name + '.res.out';
    jobTemplate.outputPath = '../../output/tap-output/' + sessionName;
    jobTemplate.errorPath = '../../output/tap-output/' + sessionName;

    let tapRequestData = {
      ip: requestIp,
      time: req.time(),
      jobData: jobTemplate,
    };

    sessionManager.createSession(sessionName).then( (session) => {
      issuePdbRequest(tapRequestData, session, req.files.file.path, req.files.file.name).then( (jobResult) => {
        console.log('Job ' + jobResult.status.jobId + ' of session ' + jobResult.status.sessionName + ' status: ' + jobResult.status.mainStatus + '-' + jobResult.status.subStatus + ', exitCode: ' + jobResult.status.exitStatus + ', failed: ' + jobResult.status.failed + ', errors: ' + jobResult.status.errors + ', description: ' + jobResult.status.description);
        res.send(200, jobResult);
        sessionManager.closeSession(sessionName);
      }, (error) => {
        if(error.hasOwnProperty('status')) {
          Logger.info('Error: ' + error.status.errors);
          console.log('Job ' + error.status.jobId + ' of session ' + error.status.sessionName + ' status: ' + error.status.mainStatus + '-' + error.status.subStatus + ', exitCode: ' + error.status.exitStatus + ', failed: ' + error.status.failed + ', errors: ' + error.status.errors + ', description: ' + error.status.description);
        } else {
          Logger.info('Error: ' + error.errors);
        }
        res.send(500, error);
        sessionManager.closeSession(sessionName);
      });
    }, (error) => {
      Logger.info('Could not create session ' + sessionName + ': ' + error);
      res.send(500, error);
    });

    return next()
  },

  handleShowServiceOutputFile: function handleShowServiceOutputFile(req, res, next) {
    req.log.info(`request handler is ${handleShowServiceOutputFile.name}`);
    res.setHeader('content-type', 'text/plain');

    let service = req.params.service;
    let sessionName = req.params.sessionName;
    let outputFile = req.params.outputFile;

    if(service !== "tap" && service !== "frst")
    {
      res.send(500, {error: "Invalid service request"});
      return next();
    }

    fs.readFile('./output/'+ service +'-output/' + sessionName + '/' + outputFile, 'utf8', (error, data) => {
      if (error) {
        console.log('Error reading file ' + outputFile);
        res.send(404, "404 Not Found: File " + outputFile + " in folder " + sessionName + " not found");
      }
      else {
        console.log(data);
        res.send(data);
      }
    });

    return next();
  },

  handleRetrieveServiceResult: function handleRetrieveServiceResult(req, res, next) {
    req.log.info(`request handler is ${handleRetrieveServiceResult.name}`);

    let service = req.params.service;
    let sessionName = req.params.sessionName;

    let path = './output/' + service + '-output/' + sessionName + "/";

    let jobResult = {};

    let stdErrRegExp = new RegExp(/(e{1}(\d)+$)/);
    let stdOutRegExp = new RegExp(/(o{1}(\d)+$)/);
    let resultOutputRegExp = null;

    if(service === "tap")
      resultOutputRegExp = new RegExp(/(res\.out$)/);
    else if(service === "frst")
      resultOutputRegExp = new RegExp(/(pdb$)/);
    else
    {
      res.send(500, "Invalid service request");
      return next();
    }

    let stdOutFile = "";
    let stdErrFile = "";
    let resOutFile = "";

    fs.readdir(path, (err, files) => {
      if(err)
      {
        console.log('Error reading directory ' + sessionName);
        res.send(500, {errors: err});
      }

      files.forEach(file => {
        if (stdOutRegExp.test(file))
          stdOutFile = file;

        else if (stdErrRegExp.test(file))
          stdErrFile = file;

        else if (resultOutputRegExp.test(file))
          resOutFile = file;
      });

      if (stdOutFile && stdErrFile) {
        fs.readFile(path + stdOutFile, 'utf8', (error, data) => {
          if (error) {
            console.log('Error reading file ' + stdOutFile);
            res.send(500, error);
          }
          else {
            jobResult.output = data;
            fs.readFile(path + stdErrFile, 'utf8', (error, data) => {
              if (error) {
                console.log('Error reading file ' + stdErrFile);
                res.send(500, error);
              }
              else {
                jobResult.errors = data;
                jobResult.resOut = resOutFile;
                res.send(200, jobResult);
              }
            });
          }
        });
      }
      else
        res.send(404, {errors: "Result not found for session " + sessionName});
    });

    return next();
  },

  handleFrstJobSubmission: function handleFrstJobSubmission(req, res, next) {
    req.log.info(`request handler is ${handleFrstJobSubmission.name}`);
    let requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    let sessionName = generateUUIDV4();

    let jobTemplate = {};

    try{
      jobTemplate = JSON.parse(req.body.jobTemplate);
    } catch(e) {
      res.send(500, e);
      return next();
    }

    jobTemplate.args[1] = req.files.file.path;
    jobTemplate.args[3] = '../../output/frst-output/' + sessionName + '/frst.pdb';
    jobTemplate.outputPath = '../../output/frst-output/' + sessionName;
    jobTemplate.errorPath = '../../output/frst-output/' + sessionName;

    let frstRequestData = {
      ip: requestIp,
      time: req.time(),
      jobData: jobTemplate,
    };

    sessionManager.createSession(sessionName).then( (session) => {
      issueFrstRequest(frstRequestData, session, req.files.file.path, req.files.file.name).then( (jobResult) => {
        console.log('Job ' + jobResult.status.jobId + ' of session ' + jobResult.status.sessionName + ' status: ' + jobResult.status.mainStatus + '-' + jobResult.status.subStatus + ', exitCode: ' + jobResult.status.exitStatus + ', failed: ' + jobResult.status.failed + ', errors: ' + jobResult.status.errors + ', description: ' + jobResult.status.description);
        res.send(200, jobResult);
        sessionManager.closeSession(sessionName);
      }, (error) => {
        if(error.hasOwnProperty('status')) {
          Logger.info('Error: ' + error.status.errors);
          console.log('Job ' + error.status.jobId + ' of session ' + error.status.sessionName + ' status: ' + error.status.mainStatus + '-' + error.status.subStatus + ', exitCode: ' + error.status.exitStatus + ', failed: ' + error.status.failed + ', errors: ' + error.status.errors + ', description: ' + error.status.description);
        } else {
          Logger.info('Error: ' + error.errors);
        }
        res.send(500, error);
        sessionManager.closeSession(sessionName);
      });
    }, (error) => {
      Logger.info('Could not create session ' + sessionName + ': ' + error);
      res.send(500, error);
    });

    return next()
  },

  handleSchedulerTest: function handleSchedulerTest(req, res, next) {
    req.log.info(`request handler is ${handleSchedulerTest.name}`);
    let requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // curl -X POST -F 'text=@/home/marco/Uni/Tesi/Projects/testFile.txt' localhost:8090/schedulerTest
    /*    fs.readFile(req.files['text'].path, (error, data) => {
          if(error) console.log('oh fuck');
          else {
            fs.writeFile('/home/marco/Uni/Tesi/Projects/apexMeme', data, (err) => {
              if (err) console.log('something went wrong');
              else console.log('written file');
            });
          }
        });*/


    let sessionName = generateUUIDV4();
    let requestData = {
      ip: requestIp,
      time: req.time(),
      //jobData: req.query["jobData"],
      jobData: {
        remoteCommand: "/home/marco/Uni/Tesi/Projects/node-ws-template/sge-tests/simple.sh",
        workingDirectory: "/home/marco/Uni/Tesi/Projects/node-ws-template/sge-tests/",
        jobName: 'testJob',
      },
    };

    let requestDataArray = {
      ip: requestIp,
      time: req.time(),
      //jobData: req.query["jobData"],
      jobData: {
        //remoteCommand: "/home/marco/Uni/Tesi/Projects/node-ws-template/sge-tests/simple.sh",
        //workingDirectory: "/home/marco/Uni/Tesi/Projects/node-ws-template/sge-tests/",
        remoteCommand: "/sge-tests/simple.sh",
        workingDirectory: "/sge-tests/",
        jobName: 'testJob',
        nativeSpecification: '',
        submitAsHold: false,
        start: 1,
        end: 4,
        incr: 1
      },
    };

    let requestDataPdb = {
      ip: requestIp,
      time: req.time(),
      jobData: {
        remoteCommand: '/home/marco/Uni/Tesi/Projects/node-ws-template/sge-scripts/tap-script/pdb2tap.sh',
        workingDirectory: '/home/marco/Uni/Tesi/Projects/node-ws-template/sge-scripts/tap-script/',
        jobName: 'testPdbJob',
        outputPath: '../../output/tap-output/' + sessionName,
        errorPath: '../../output/tap-output/' + sessionName,
        args: [
          //'-i ../../output/tap-output/' + sessionName + '/3DFR.pdb',
          //'-P ../../output/tap-output/' + sessionName + '/3DFR.pdb.res.out',
          '-i 3DFR.pdb',
          //'-i ' + req.files.file.path,
          //'-P ../../output/tap-output/' + sessionName + '/' + req.files.file.name + '.res.out',
          '-P ../../output/tap-output/' + sessionName + '/3DFR.pdb.res.out',
          '--acc'
        ],
      }
    };

    let requestDataFrst = {
      ip: requestIp,
      time: req.time(),
      jobData: {
        remoteCommand: '/home/marco/Uni/Tesi/Projects/node-ws-template/sge-scripts/frst-script/pdb2energy.sh',
        workingDirectory: '/home/marco/Uni/Tesi/Projects/node-ws-template/sge-scripts/frst-script/',
        jobName: 'testFrstJob',
        outputPath: '../../output/frst-output/' + sessionName,
        errorPath: '../../output/frst-output/' + sessionName,
        args: [
            '-i 3DFR.pdb',
          '-o /home/marco/Uni/Tesi/Projects/node-ws-template/output/frst-output/' + sessionName + '/frst.pdb',
          '-w 5',
          '-v',
          //'-c A',
          //  '--nmr',
        ],
      }
    };

    /*
        fs.readFile('/home/marco/Uni/Tesi/Projects/node-ws-template/sge-scripts/tap-script/3DFR.pdb', (error, data) => {
          if (error) {
            console.log('Error reading file 3DFR.pdb');
          } else {
            fs.writeFile('/home/marco/Uni/Tesi/Projects/node-ws-template/output/tap-output' + sessionName + '/3DFR.pdb', data, (error) => {
              if (error) {
                console.log('Error writing file 3DFR.pdb' + error);
              }
              else console.log('Written file 3DFR.pdb');
            });
          }
        });
    */

    /*sessionManager.createSession(sessionName).then( (session) => {
      issuePdbRequest(requestDataPdb, session, '/home/marco/Uni/Tesi/Projects/node-ws-template/sge-scripts/tap-script/3DFR.pdb', '3DFR.pdb').then( (jobResult) => {
        console.log('Job ' + jobResult.status.jobId + ' of session ' + jobResult.status.sessionName + ' status: ' + jobResult.status.mainStatus + '-' + jobResult.status.subStatus + ', exitCode: ' + jobResult.status.exitStatus + ', failed: ' + jobResult.status.failed + ', errors: ' + jobResult.status.errors + ', description: ' + jobResult.status.description);
        res.send(200, jobResult);
      }, (error) => {
        Logger.info('Error: ' + error.errors);
        res.send(500, error);
      });
    }, (error) => {
      Logger.info('Could not create session ' + sessionName + ': ' + error);
      res.send(500, error);
    });*/

    sessionManager.createSession(sessionName).then( (session) => {
      issueFrstRequest(requestDataFrst, session, '/home/marco/Uni/Tesi/Projects/node-ws-template/sge-scripts/frst-script/3DFR.pdb', '3DFR.pdb').then( (jobResult) => {
        console.log('Job ' + jobResult.status.jobId + ' of session ' + jobResult.status.sessionName + ' status: ' + jobResult.status.mainStatus + '-' + jobResult.status.subStatus + ', exitCode: ' + jobResult.status.exitStatus + ', failed: ' + jobResult.status.failed + ', errors: ' + jobResult.status.errors + ', description: ' + jobResult.status.description);
        res.send(200, jobResult);
      }, (error) => {
        Logger.info('Error: ' + error.errors);
        res.send(500, error);
      });
    }, (error) => {
      Logger.info('Could not create session ' + sessionName + ': ' + error);
      res.send(500, error);
    });

    /*    sessionManager.createSession(sessionName).then( (session) => {
          Scheduler.handleRequest(requestData, session).then( (status) => {
            console.log('Request outcome: ' + status.description );
            Scheduler.getJobResult(status.jobData.jobId, session).then( (status) => {
              console.log('Job ' + status.jobId + ' of session ' + status.sessionName + ' status: ' + status.mainStatus + '-' + status.subStatus + ', exitCode: ' + status.exitStatus + ', failed: \"' + status.failed + '\", errors: ' + status.errors + ', description: ' + status.description);
            }, (error) => {
              console.log('Error: ' + error.errors);
            });
          }, (error) => {
            console.log('Error: ' + error.errors);
          });
        }, (error) => {
          console.log('Could not create session ' + sessionName + ': ' + error);
        });*/
    /*        sessionManager.createSession(sessionName).then( (session) => {
            let job1 = issueRequest(requestData, session);
            let job2 = issueRequest(requestData, session);
            Promise.all([job1, job2]).then( (status) => {
              console.log('Job ' + status[0].jobId + ' of session ' + status[0].sessionName + ' status: ' + status[0].mainStatus + '-' + status[0].subStatus + ', exitCode: ' + status[0].exitStatus + ', failed: \"' + status[0].failed + '\", errors: ' + status[0].errors + ', description: ' + status[0].description);
              console.log('Job ' + status[1].jobId + ' of session ' + status[1].sessionName + ' status: ' + status[1].mainStatus + '-' + status[1].subStatus + ', exitCode: ' + status[1].exitStatus + ', failed: \"' + status[0].failed + '\", errors: ' + status[1].errors + ', description: ' + status[1].description);
            }, (error) => {
              console.log('Error in promise.all: ' + error.errors);
            })
          }, (error) => {
            Logger.info('Could not create session ' + sessionName + ': ' + error.errors);
          });*/

    //res.send(200, 'done');
    return next()
  },

  handleJobSubmission: function handleJobSubmission(req, res, next) {
    req.log.info(`request handler is ${handleJobSubmission.name}`);

    // Fetches the IP of the client who made the request.
    let requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    let hasAttachedSession = !!(req.body.hasOwnProperty("session") && req.body.session);
    let sessionName = hasAttachedSession ? req.body.session : generateUUIDV4();
    let sessionPromise = hasAttachedSession ? sessionManager.getSession(sessionName) : sessionManager.createSession(sessionName);
    let submissionPromise = [];


    sessionPromise.then((session) => {
      req.body.jobTemplates.forEach((jobTemplate) => {
        submissionPromise.push(
          Scheduler.handleRequest({
            ip: requestIp,
            time: req.time(),
            jobData: jobTemplate
          }, session)
        );
      });

      Promise.all(submissionPromise.map(p => p.catch(e => e)))
        .then((statuses) => {
          let errorsOccurred = false;
          let failedStatuses = [];

          statuses.forEach((status) => {
            if(status.errors)
            {
              failedStatuses.push(status);
              errorsOccurred = true;
            }
            else
            {
              writeToFileSystem("dummy-output/" + session.sessionName, 'Job ' + status.jobData.jobId + ' requestOutcome', status).then( (success) => {
                console.log(success);
              }, (error) => {
                console.log(error);
              });
            }
          });

          if(errorsOccurred)
          {
            statuses.forEach((status) => {
              if(!status.errors)
                Scheduler.removeJobFromHistory(status.jobData.jobId)
            });
            res.send(500, failedStatuses);
            sessionManager.closeSession(sessionName);
          }
          else
            res.send(200, {statuses: statuses, session: sessionName});
        })

        .catch((error) => {
          console.log(error);
          sessionManager.closeSession(sessionName);
          res.send(500, error);
        });

    }, (error) => {
      Logger.info('Could not create session ' + sessionName + ': ' + error);
      res.send(500,error);
    });

    return next()
  },

  handleJobExecution: function handleJobExecution(req, res, next) {
    req.log.info(`request handler is ${handleJobExecution.name}`);

    if(!req.body.session)
    {
      res.send(500, [new Error("Must include a session in the argument!")]);
      return next();
    }
    let sessionName = req.body.session;
    let getJobResultPromises = [];

    sessionManager.getSession(sessionName).then((session) => {

      req.body.statuses.forEach((status) => {
        getJobResultPromises.push(Scheduler.getJobResult(status.jobData.jobId, session));
      });

      Promise.all(getJobResultPromises)
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

          if(!errorsOccurred){
            if(req.body.closeSession)
              sessionManager.closeSession(sessionName);
            res.send(200, {statuses: statuses});
          }
          else
          {
            sessionManager.closeSession(sessionName);
            res.send(500, statuses);
          }

          statuses.forEach((status) => {
            writeToFileSystem("dummy-output/" + session.sessionName, 'Job ' + status.jobId + ' requestOutcome', status).then( (success) => {
              console.log(success);
            }, (error) => {
              console.log(error);
            });
          });
      }, (error) => {
        sessionManager.closeSession(sessionName);
        res.send(500, [error]);
      });

    }, (error) => {
      res.send(500, [error]);
    });


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

}