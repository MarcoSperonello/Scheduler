import Logger from '../logger';
import {Sec, sessionManager, JOBTYPE} from './scheduler-manager';

import {when, defer} from 'promised-io';

/**
 * Scans the users array and removes users which have been inactive (i.e. have
 * not made a request) for longer than the maximum allotted time
 * (userLifespan_).
 */
export function monitorUsers() {
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

/**
 * Monitors the status of the job whose index is specified by the jobId
 * parameter. The status is checked as often as specified by the
 * jobPollingInterval_ parameter. The function returns the promise passed as the
 * def parameter once said promise is resolved (when the job is COMPLETED) or
 * rejected (when an error occurs).
 * The resolved promise consists of a JSON object with the following structure:
 *
 * {
 *       jobId: {integer} the id of the job
 *       jobName: {string} the name of the job
 *       mainStatus: {string} the main status of the job as specified in
 * ../nDrmaa/Session.js
 *       subStatus: {string} the sub status of the job as specified in
 * ../nDrmaa/Session.js
 *       description: {string} a brief description of what is happening/happened
 * to the job
 * }
 *
 * The rejected promise is the dump of the error if the status of the job could
 * not be read, or a simple message if a jobId of a job already removed from
 * history was passed to the function.
 *
 * @param jobId: the id of the job to monitor
 * @param def: the promise to resolve or reject
 * @returns {defer} promise
 */
function monitorJob(jobId, def) {
  try {
    // Keeps checking the status of the job until it is completed or an error
    // occurs.
    pollJob(jobId).then(
        (status) => {
          if (status.mainStatus !== 'COMPLETED') {
            // console.log('not yet completed ' + status.description);
            // The job is not completed, the function is called again after the
            // specified time.
            setTimeout(
                monitorJob.bind(null, jobId, def), Sec.jobPollingInterval_);
          } else {
            def.resolve(status);
          }
        },
        (error) => {
          console.log(
              'Error reading status for job ' + Sec.jobs_[index].jobId + ' (' +
              Sec.jobs_[index].jobName + '): ' + error);
          def.reject(error);
        });
  } catch (error) {
    console.log(error);
    def.reject('Job ' + jobId + ' already removed from history.');
  }
  return def.promise;
}

/**
 * Wrapper for the monitorJob function to hide implementation details.
 *
 * @param jobId: the id of the job to monitor
 * @returns {defer}
 */
export function getJobResult(jobId) {
  return monitorJob(jobId, new defer());
}

/**
 * Queries the SGE to monitor the status of the specified job. The promise
 * returned is resolved if the status of the job is read successfully, otherwise
 * it is rejected.
 *
 * The resolved promise consists of a JSON whose structure is described in the
 * monitorJob function documentation.
 * The rejected promise is the dump of the error if the status of the job could
 * not be read.
 *
 * @param jobId: the id of the job to monitor
 * @returns {defer} promise
 */
function pollJob(jobId) {
  let def = new defer();

  // Attempts to find the job with the id corresponding to the one passed to the
  // function.
  let index = Sec.jobs_.findIndex((elem) => { return elem.jobId === jobId; });

  // If no such job is present in the job history, the function simply returns.
  // The resulting error will be caught and handled by monitorJob.
  if (index === -1) return;

  when(sessionManager.getSession(Sec.sessionName_), (session) => {
    // Fetches the status of the specified job and verifies if any meaningful
    // changes to the status of the job took place or any timeouts have been
    // violated since the previous check. The function used to do so depends on
    // whether the JOBTYPE of the job is SINGLE or ARRAY.
    // The JSON object containing several job information is used to resolve the
    // promise.
    when(
        session.getJobProgramStatus([Sec.jobs_[index].jobId]),
        (jobStatus) => {
          if (Sec.jobs_[index].jobType === JOBTYPE.SINGLE) {
            when(monitorSingleJob(session, jobStatus, index), (result) => {
              def.resolve(result);
            });
          } else {
            when(monitorArrayJob(session, jobStatus, index), (result) => {
              def.resolve(result);
            });
          }
        },
        (error) => {
          Logger.info(
              'Error reading status for job ' + Sec.jobs_[index].jobId + ' (' +
              Sec.jobs_[index].jobName + ').');
          def.reject(error);
        });
  });
  return def.promise;
}

/**
 * Compares the current status of the job (of JOBTYPE equal to SINGLE) specified
 * by the index parameter to the one stored in the job history (hence memorized
 * during the previous call of this function or, if the function has not been
 * called before, after the job was submitted) for this job and takes
 * appropriate action if necessary.
 * The events which are checked and the resulting actions are the following:
 *
 * (1) the job went from !RUNNING to RUNNING since the previous check --> the
 * submitDate field of the job is updated to the current time to to represent
 * the approximate time at which the job switched from to RUNNING;
 * (2) the job was !RUNNING, is still !RUNNING and the time limit for !RUNNING
 * jobs (maxJobQueuedTime_) has been exceeded --> the job is forcibly terminated
 * and deleted from history;
 * (3) the job was RUNNING, is still RUNNING and the time limit for RUNNING jobs
 * (maxJobRunningTime_) has been exceeded --> the job is forcibly terminated and
 * deleted from history;
 * (4) the job was !COMPLETED and is now COMPLETED --> the job is deleted from
 * history.
 *
 * Note: the submitDate field of the job is used to verify whether any timeouts
 * were hit (points (2) and (3)).
 * Note: given the asynchronicity of this function and the ones which call it,
 * the updated submitDate field (point (1)) is subjected to unavoidable
 * approximations, whose precision is inversely proportional to the time
 * interval between two subsequent calls of this function (regulated by the
 * jobPollingInterval_ parameter).
 *
 * The resolved promise consists of a JSON whose structure is described in the
 * monitorJob function documentation.
 *
 * @param session: the name of the session the job belongs to
 * @param jobStatus: the current status of the job as returned from
 * getJobProgramStatus
 * @param index: the index of the job in the job history (jobs_)
 * @returns {defer} promise
 */
function monitorSingleJob(session, jobStatus, index) {
  let def = new defer();
  // If the job has not yet been completed but its status changed from
  // ON-HOLD/QUEUED to RUNNING, said status is updated to the current
  // RUNNING value and the submitDate field is updated to represent
  // the approximate time at which the job switched from QUEUED to
  // RUNNING.
  if (jobStatus[Sec.jobs_[index].jobId].mainStatus !== 'COMPLETED' &&
      jobStatus[Sec.jobs_[index].jobId].mainStatus === 'RUNNING' &&
      Sec.jobs_[index].jobStatus !== 'RUNNING') {
    Logger.info(
        'Job ' + Sec.jobs_[index].jobId + ' (' + Sec.jobs_[index].jobName +
        ') status changed from ' + Sec.jobs_[index].jobStatus + ' to ' +
        jobStatus[Sec.jobs_[index].jobId].mainStatus + '.');
    def.resolve({
      jobId: Sec.jobs_[index].jobId,
      jobName: Sec.jobs_[index].jobName,
      mainStatus: jobStatus[Sec.jobs_[index].jobId].mainStatus,
      subStatus: jobStatus[Sec.jobs_[index].jobId].subStatus,
      description: 'Job switched from ' + Sec.jobs_[index].jobStatus + ' to ' +
          jobStatus[Sec.jobs_[index].jobId].mainStatus + '.'
    });
    Sec.jobs_[index].jobStatus = jobStatus[Sec.jobs_[index].jobId].mainStatus;
    Sec.jobs_[index].submitDate = new Date().getTime();
  }
  // console.log("JOBTIME for JOB " + Sec.jobs_[i].jobId + " equal
  // to " + (new Date().getTime() - Sec.jobs_[i].submitDate));

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
          jobStatus[Sec.jobs_[index].jobId].mainStatus + ' runtime.');
      def.resolve({
        jobId: Sec.jobs_[index].jobId,
        jobName: Sec.jobs_[index].jobName,
        mainStatus: 'COMPLETED',
        subStatus: 'FAILED',
        description: 'Maximum ' + jobStatus[Sec.jobs_[index].jobId].mainStatus +
            ' runtime exceeded.'
      });
      deleteJob(session, index);
    } else {
      // The job was running during the previous check and it still is.
      def.resolve({
        jobId: Sec.jobs_[index].jobId,
        jobName: Sec.jobs_[index].jobName,
        mainStatus: jobStatus[Sec.jobs_[index].jobId].mainStatus,
        subStatus: jobStatus[Sec.jobs_[index].jobId].subStatus,
        description: 'Job still running.'
      });
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
        ') from job history. Current job history size: ' +
        (Sec.jobs_.length - 1) + '.');
    def.resolve({
      jobId: Sec.jobs_[index].jobId,
      jobName: Sec.jobs_[index].jobName,
      mainStatus: jobStatus[Sec.jobs_[index].jobId].mainStatus,
      subStatus: jobStatus[Sec.jobs_[index].jobId].subStatus,
      description: 'Job completed within allotted runtimes.'
    });
    Sec.jobs_.splice(index, 1);
  }
  return def.promise;
}

/**
 * Compares the current status of the job (of JOBTYPE equal to ARRAY) specified
 * by the index parameter to the one stored in the job history (hence memorized
 * during the previous call of this function or, if the function has not been
 * called before, after the job was submitted) for this job and takes
 * appropriate action if necessary. The job is comprised of several tasks which
 * need to be examined since they determine the status of the job itself.
 * Since the status of an array job is UNDETERMINED if at least one of its tasks
 * is not completed,
 * The events which are checked and the resulting actions are the following:
 *
 * (1) the first task of the job was !RUNNING, is still !RUNNING and the time
 * limit for !RUNNING array jobs (maxArrayJobQueuedTime_) has been exceeded -->
 * the job is forcibly terminated and deleted from history;
 * (2) at least the first task of the job started RUNNING and total execution
 * time of the job has exeeced the time limit for RUNNING array jobs
 * (maxArrayJobRunningTime_) --> the job is forcibly terminated and deleted from
 * history;
 * (3) the job was !COMPLETED and is now COMPLETED --> the job is deleted from
 * history.
 *
 * Note: the total running time of the job (point (2)) is calculated by summing
 * the RUNNING time of each task.
 * Note: the runningStart and runningTime fields of each task are used in the
 * computation of the total running time of the job (point (2)).
 * Note: given the asynchronicity of this function and the ones which call it,
 * the runningStart and runningTime fields of each task are subjected to
 * unavoidable approximations, whose precision is inversely proportional to the
 * time interval between two subsequent calls of this function (regulated by the
 * jobPollingInterval_ parameter).
 *
 * The resolved promise consists of a JSON whose structure is described in the
 * monitorJob function documentation.
 *
 * @param session: the name of the Drmaa session the job belongs to
 * @param jobStatus: the current status of the job as returned from
 * getJobProgramStatus
 * @param index: the index of the job in the job history (jobs_)
 * @returns {defer} promise
 */
function monitorArrayJob(session, jobStatus, index) {
  let def = new defer();

  if (jobStatus[Sec.jobs_[index].jobId].mainStatus !== 'COMPLETED') {
    let currentTime = new Date().getTime();
    // If the first task is still not running after the maximum allotted queued
    // time, the job is deleted and removed from history.
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
      def.resolve({
        jobId: Sec.jobs_[index].jobId,
        jobName: Sec.jobs_[index].jobName,
        mainStatus: 'COMPLETED',
        subStatus: 'FAILED',
        description: 'Maximum ' +
            jobStatus[Sec.jobs_[index].jobId][Sec.jobs_[index].firstTaskId]
                .mainStatus +
            ' runtime exceeded.'
      });
      deleteJob(session, index);
    } else {
      // Scans the array of tasks.
      for (let taskId = Sec.jobs_[index].firstTaskId;
           taskId <= Sec.jobs_[index].lastTaskId;
           taskId += Sec.jobs_[index].increment) {
        let taskIndex = Sec.jobs_[index].taskInfo.findIndex(
            (elem) => { return elem.taskId === taskId; });

        // If the task has already been completed, no further analysis for this
        // task is needed.
        if (Sec.jobs_[index].taskInfo[taskIndex].status === 'COMPLETED')
          continue;

        if (jobStatus[Sec.jobs_[index].jobId][taskId].mainStatus ===
            'RUNNING') {
          // If the task went from not running to running, the runningStart
          // field and status field of the task are updated.
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
          }
          // If the task was running during the previous check and it still is,
          // the total execution time of the job is updated accordingly.
          else {
            // Running time as of the previous check.
            let previousRunningTime =
                Sec.jobs_[index].taskInfo[taskIndex].runningTime;
            // If the runningStart parameter is equal to 0 then the task started
            // directly as RUNNING and the task can be considered to have
            // approximately started running at the current time. The
            // runningStart parameter is updated to reflect this assumption.
            Sec.jobs_[index].taskInfo[taskIndex].runningStart =
                Sec.jobs_[index].taskInfo[taskIndex].runningStart === 0 ?
                currentTime :
                Sec.jobs_[index].taskInfo[taskIndex].runningStart;
            // The running time of the task is calculated using the current time
            // and the time at which the task switched to RUNNING.
            Sec.jobs_[index].taskInfo[taskIndex].runningTime =
                currentTime - Sec.jobs_[index].taskInfo[taskIndex].runningStart;
            // The total execution time of the job is updated.
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
        }
        // The task is now COMPLETED and it was not during the previous check.
        // The total execution time of the job and the status of the task are
        // updated accordingly.
        else if (
            jobStatus[Sec.jobs_[index].jobId][taskId].mainStatus ===
            'COMPLETED') {
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
        // If the job total execution time has exceeded the maximum value, the
        // job is terminated and removed from history.
        if (Sec.jobs_[index].totalExecutionTime > Sec.maxArrayJobRunningTime_) {
          Logger.info(
              'Job ' + Sec.jobs_[index].jobId + ' (' +
              Sec.jobs_[index].jobName + ') has exceeded maximum ' +
              jobStatus[Sec.jobs_[index].jobId][Sec.jobs_[index].firstTaskId]
                  .mainStatus +
              ' runtime. Terminating.');
          def.resolve({
            jobId: Sec.jobs_[index].jobId,
            jobName: Sec.jobs_[index].jobName,
            mainStatus: 'COMPLETED',
            subStatus: 'FAILED',
            description: 'Maximum ' +
                jobStatus[Sec.jobs_[index].jobId][Sec.jobs_[index].firstTaskId]
                    .mainStatus +
                ' runtime exceeded.'
          });
          deleteJob(session, index);
          return def.promise;
        }
      }
      // The job is still running.
      def.resolve({
        jobId: Sec.jobs_[index].jobId,
        jobName: Sec.jobs_[index].jobName,
        mainStatus: jobStatus[Sec.jobs_[index].jobId].mainStatus,
        subStatus: jobStatus[Sec.jobs_[index].jobId].subStatus,
        description:
            'Job still ' + jobStatus[Sec.jobs_[index].jobId].mainStatus,
      });
    }
  }
  // The job as a whole is now COMPLETED. The job is removed from history.
  else if (jobStatus[Sec.jobs_[index].jobId].mainStatus === 'COMPLETED') {
    Logger.info(
        'Job ' + Sec.jobs_[index].jobId + ' (' + Sec.jobs_[index].jobName +
        ') already terminated execution.');
    Logger.info(
        'Removing job ' + Sec.jobs_[index].jobId + ' (' +
        Sec.jobs_[index].jobName +
        ') from job history. Current job history size: ' +
        (Sec.jobs_.length - 1) + '.');
    def.resolve({
      jobId: Sec.jobs_[index].jobId,
      jobName: Sec.jobs_[index].jobName,
      mainStatus: jobStatus[Sec.jobs_[index].jobId].mainStatus,
      subStatus: jobStatus[Sec.jobs_[index].jobId].subStatus,
      description: 'Job completed within allotted runtimes.'
    });
    Sec.jobs_.splice(index, 1);
  }
  return def.promise;
}

/**
 * Deletes the job specified by the index parameter and removes it from the job
 * history.
 *
 * @param session: the name of the Drmaa session the job belongs to
 * @param index: the index of the job in the job history (jobs_)
 */
function deleteJob(session, index) {
  when(session.control(Sec.jobs_[index].jobId, session.TERMINATE), () => {
    Logger.info(
        'Removing job ' + Sec.jobs_[index].jobId + ' (' +
        Sec.jobs_[index].jobName +
        ') from job history. Current job history size: ' +
        (Sec.jobs_.length - 1) + '.');
    Sec.jobs_.splice(index, 1);
  });
}
