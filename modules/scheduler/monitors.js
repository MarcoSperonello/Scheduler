import Logger from '../logger';
import {Sec, sessionManager, JOBTYPE} from './scheduler-manager';

import {when, defer} from 'promised-io';

/**
 * Queries the SGE to monitor the status of submitted jobs. Jobs which have
 * exceeded their maximum runtime and are still queued/running are terminated
 * and removed from history. Jobs which terminated in the allotted time are
 * removed from history.
 */

export function pollJobs() {
  // There are no jobs in the job history.
  if (Sec.jobs_.length === 0) return;

  when(sessionManager.getSession('testSession'), (session) => {
    // Checks the status of each job in the job history.
    for (let i = Sec.jobs_.length - 1; i >= 0; i--) {
      when(
          session.getJobProgramStatus([Sec.jobs_[i].jobId]),
          (jobStatus) => {
            if (Sec.jobs_[i].jobType === JOBTYPE.SINGLE) {
              monitorSingleJob(session, jobStatus, i);
            } else {
              monitorArrayJob(session, jobStatus, i);
            }
          },
          () => {
            Logger.info(
                'Error reading status for job ' + Sec.jobs_[i].jobId + ' (' +
                Sec.jobs_[i].jobName + ').');
          });
    }
  });
}

/**
 * Scans the users array and removes users which have been inactive (i.e. have
 * not made a request) for longer than the maximum allotted time
 * (userLifespan_).
 */
export function pollUsers() {
  let currentTime = new Date().getTime();
  for (let i = Sec.users_.length - 1; i >= 0; i--) {
    if (currentTime -
            Sec.users_[i].requests[Sec.users_[i].requests.length - 1] >
        Sec.userLifespan_) {
      Logger.info(
          'Removing user ' + Sec.users_[i].ip +
          ' from history. The user has been inactive for longer than the maximum allotted time.');
      Sec.users_.splice(i, 1);
    }
  }
}

function monitorSingleJob(session, jobStatus, index) {
  // If the job has not yet been completed but its status changed from
  // ON-HOLD/QUEUED to RUNNING, said status is updated to the current
  // RUNNING value and the submitDate field is updated to represent
  // approximate time at which the job switched from QUEUED to
  // RUNNING.
  // The accuracy of this measurement depends on the polling interval
  // of this function.
  if (jobStatus[Sec.jobs_[index].jobId].mainStatus !== 'COMPLETED' &&
      jobStatus[Sec.jobs_[index].jobId].mainStatus === 'RUNNING' &&
      Sec.jobs_[index].jobStatus !== 'RUNNING') {
    Logger.info(
        'Job ' + Sec.jobs_[index].jobId + ' (' + Sec.jobs_[index].jobName +
        ') status changed from ' + Sec.jobs_[index].jobStatus + ' to ' +
        jobStatus[Sec.jobs_[index].jobId].mainStatus + '.');
    Sec.jobs_[index].jobStatus = jobStatus[Sec.jobs_[index].jobId].mainStatus;
    Sec.jobs_[index].submitDate = new Date().getTime();
  }
  // console.log("JOBTIME for JOB " + Sec.jobs_[i].jobId + " equal
  // to " + (new Date().getTime() - Sec.jobs_[i].submitDate));

  // job era pending ed è ancora pending
  // Terminates and removes from history jobs which are still
  // queued or running after the maximum allotted runtimes.
  else if (jobStatus[Sec.jobs_[index].jobId].mainStatus !== 'COMPLETED') {
    let currentTime = new Date().getTime();
    if (jobStatus[Sec.jobs_[index].jobId].mainStatus !== 'RUNNING' &&
            currentTime - Sec.jobs_[index].submitDate > Sec.maxJobQueuedTime_ ||
        jobStatus[Sec.jobs_[index].jobId].mainStatus === 'RUNNING' &&
            currentTime - Sec.jobs_[index].submitDate >
                Sec.maxJobRunningTime_) {
      Logger.info(
          'Job ' + Sec.jobs_[index].jobId + ' (' + Sec.jobs_[index].jobName +
          ') has exceeded maximum ' +
          jobStatus[Sec.jobs_[index].jobId].mainStatus +
          ' runtime. Terminating.');
      deleteJob(session, index);
    }
  }
  // Jobs whose execution ended within the maximum allotted runtimes
  // are removed from history.
  else if (jobStatus[Sec.jobs_[index].jobId].mainStatus === 'COMPLETED') {
    Logger.info(
        'Job ' + Sec.jobs_[index].jobId + ' (' + Sec.jobs_[index].jobName +
        ') already terminated execution.');
    Logger.info(
        'Removing job ' + Sec.jobs_[index].jobId + ' (' +
        Sec.jobs_[index].jobName +
        ') from job history. Current job history size: ' + Sec.jobs_.length +
        '.');
    Sec.jobs_.splice(index, 1);
  }
}

function monitorArrayJob(session, jobStatus, index) {
  if (jobStatus[Sec.jobs_[index].jobId].mainStatus !== 'COMPLETED') {
    let currentTime = new Date().getTime();
    // task iniziale ancora in coda dopo troppo tempo
    if (jobStatus[Sec.jobs_[index].jobId][Sec.jobs_[index].firstTaskId]
                .mainStatus !== 'COMPLETED' &&
        jobStatus[Sec.jobs_[index].jobId][Sec.jobs_[index].firstTaskId]
                .mainStatus !== 'RUNNING' &&
        currentTime - Sec.jobs_[index].submitDate >
            Sec.maxArrayJobQueuedTime_) {
      Logger.info(
          'Job ' + Sec.jobs_[index].jobId + ' (' + Sec.jobs_[index].jobName +
          ') has exceeded maximum ' +
          jobStatus[Sec.jobs_[index].jobId][Sec.jobs_[index].firstTaskId]
              .mainStatus +
          ' runtime. Terminating.');
      deleteJob(session, index);
    } else {
      for (let taskId = Sec.jobs_[index].firstTaskId;
           taskId <= Sec.jobs_[index].lastTaskId;
           taskId += Sec.jobs_[index].increment) {
        let taskIndex = Sec.jobs_[index].taskInfo.findIndex(
            (elem) => { return elem.taskId === taskId; });

        // task completato e quindi ignorabile, si può passare al task
        // successivo
        if (Sec.jobs_[index].taskInfo[taskIndex].status === 'COMPLETED')
          continue;

        if (jobStatus[Sec.jobs_[index].jobId][taskId].mainStatus ===
            'RUNNING') {
          // task è passato da non running a running
          if (Sec.jobs_[index].taskInfo[taskIndex].status !== 'RUNNING') {
            Sec.jobs_[index].taskInfo[taskIndex].runningStart = currentTime;
            Logger.info(
                'Task ' + taskId + ' of job ' + Sec.jobs_[index].jobId +
                ' started running on ' +
                new Date(Sec.jobs_[index].taskInfo[taskIndex].runningStart)
                    .toUTCString() +
                '.');
            Logger.info(
                'Task ' + taskId + ' status of job ' + Sec.jobs_[index].jobId +
                ' changed from ' + Sec.jobs_[index].taskInfo[taskIndex].status +
                ' to ' + jobStatus[Sec.jobs_[index].jobId][taskId].mainStatus +
                '.');
            Sec.jobs_[index].taskInfo[taskIndex].status =
                jobStatus[Sec.jobs_[index].jobId][taskId].mainStatus;
          } else {  // task era running al controllo precedente e lo è ancora
            let previousRunningTime =
                Sec.jobs_[index].taskInfo[taskIndex].runningTime;
            Sec.jobs_[index].taskInfo[taskIndex].runningStart =
                Sec.jobs_[index].taskInfo[taskIndex].runningStart === 0 ?
                currentTime :
                Sec.jobs_[index].taskInfo[taskIndex].runningStart;
            if (Sec.jobs_[index].taskInfo[taskIndex].runningStart ===
                currentTime) {
              Sec.jobs_[index].startedAsRunning = true;
            }

            Sec.jobs_[index].taskInfo[taskIndex].runningTime =
                Sec.jobs_[index].startedAsRunning ?
                currentTime -
                    Sec.jobs_[index].taskInfo[taskIndex].runningStart +
                    Sec.jobPollingInterval_ :
                currentTime - Sec.jobs_[index].taskInfo[taskIndex].runningStart;
            Sec.jobs_[index].totalExecutionTime +=
                Sec.jobs_[index].taskInfo[taskIndex].runningTime -
                previousRunningTime;

            Logger.info(
                'Task ' + taskId + ' of job ' + Sec.jobs_[index].jobId +
                ' current running time: ' +
                new Date(Sec.jobs_[index].taskInfo[taskIndex].runningTime) +
                '.');
            Logger.info(
                'Total execution time of job ' + Sec.jobs_[index].jobId + ' (' +
                Sec.jobs_[index].jobName + '): ' +
                Sec.jobs_[index].totalExecutionTime + '.');
          }
          // task è passato da running a completed (la parte dopo && può andare
          // esclusa)
        } else if (
            jobStatus[Sec.jobs_[index].jobId][taskId].mainStatus ===
                'COMPLETED' &&
            Sec.jobs_[index].taskInfo[taskIndex] !== 'COMPLETED') {
          let previousRunningTime =
              Sec.jobs_[index].taskInfo[taskIndex].runningTime;
          Sec.jobs_[index].taskInfo[taskIndex].runningTime =
              currentTime - Sec.jobs_[index].taskInfo[taskIndex].runningStart;
          Sec.jobs_[index].totalExecutionTime +=
              Sec.jobs_[index].taskInfo[taskIndex].runningTime -
              previousRunningTime;

          Logger.info(
              'Task ' + taskId + ' status of job ' + Sec.jobs_[index].jobId +
              ' changed from ' + Sec.jobs_[index].taskInfo[taskIndex].status +
              ' to ' + jobStatus[Sec.jobs_[index].jobId][taskId].mainStatus +
              '.');
          Logger.info(
              'Task ' + taskId + ' of job ' + Sec.jobs_[index].jobId +
              ' completed execution in: ' +
              new Date(Sec.jobs_[index].taskInfo[taskIndex].runningTime) + '.');
          Logger.info(
              'Total execution time of job ' + Sec.jobs_[index].jobId + ' (' +
              Sec.jobs_[index].jobName + '): ' +
              Sec.jobs_[index].totalExecutionTime + '.');
          Sec.jobs_[index].taskInfo[taskIndex].status =
              jobStatus[Sec.jobs_[index].jobId][taskId].mainStatus;
        }
        if (Sec.jobs_[index].totalExecutionTime > Sec.maxArrayJobRunningTime_) {
          Logger.info(
              'Job ' + Sec.jobs_[index].jobId + ' (' +
              Sec.jobs_[index].jobName + ') has exceeded maximum ' +
              jobStatus[Sec.jobs_[index].jobId][Sec.jobs_[index].firstTaskId]
                  .mainStatus +
              ' runtime. Terminating.');
          when(
              session.control(Sec.jobs_[index].jobId, session.TERMINATE),
              () => {
                Logger.info(
                    'Removing job ' + Sec.jobs_[index].jobId + ' (' +
                    Sec.jobs_[index].jobName + ') from job history.');
                Sec.jobs_.splice(index, 1);
              });
          break;
        }
      }
    }
  } else if (jobStatus[Sec.jobs_[index].jobId].mainStatus === 'COMPLETED') {
    Logger.info(
        'Job ' + Sec.jobs_[index].jobId + ' (' + Sec.jobs_[index].jobName +
        ') already terminated execution.');
    Logger.info(
        'Removing job ' + Sec.jobs_[index].jobId + ' (' +
        Sec.jobs_[index].jobName +
        ') from job history. Current job history size: ' + Sec.jobs_.length +
        '.');
    Sec.jobs_.splice(index, 1);
  }
}

function deleteJob(session, index) {
  when(session.control(Sec.jobs_[index].jobId, session.TERMINATE), () => {
    Logger.info(
        'Removing job ' + Sec.jobs_[index].jobId + ' (' +
        Sec.jobs_[index].jobName + ') from job history.');
    Sec.jobs_.splice(index, 1);
  });
}
