import Logger from '../logger';
import {Sec, sm} from './scheduler-manager';

import {when, defer} from 'promised-io';
import fs from 'fs';

/**
 * Queries the SGE to monitor the status of submitted jobs. Jobs which have
 * exceeded their maximum runtime and are still queued/running are terminated
 * and removed from history. Jobs which terminated in the allotted time are
 * removed from history.
 */
export function pollJobs() {
  // There are no jobs in the job history.
  if (Sec.jobs_.length === 0) return;

  when(sm.getSession('testSession'), (session) => {
    // Checks the status of each job in the job history.
    for (let i = Sec.jobs_.length - 1; i >= 0; i--) {
      when(
          session.getJobProgramStatus(Sec.jobs_[i].jobId),
          (jobStatus) => {
            // If the job has not yet been completed but its status changed from
            // QUEUED to RUNNING, said status is updated to the current RUNNING
            // value and the submitDate field now represents the approximate
            // time at which the job switched from QUEUED to RUNNING. The
            // accuracy of this measurement depends on the polling interval of
            // this function.
            if (jobStatus.mainStatus !== 'COMPLETED' &&
                jobStatus.mainStatus !== 'QUEUED' === Sec.jobs_[i].jobStatus) {
              Logger.info(
                  'Job ' + Sec.jobs_[i].jobId + '(' + Sec.jobs_[i].jobName +
                  ') status changed from ' + Sec.jobs_[i].jobStatus + ' to ' +
                  jobStatus.mainStatus);
              Sec.jobs_[i].jobStatus = jobStatus.mainStatus;
              Sec.jobs_[i].submitDate = new Date().getTime();
            }
            // console.log("JOBTIME for JOB " + Sec.jobs_[i].jobId + " equal
            // to " + (new Date().getTime() - Sec.jobs_[i].submitDate));

            // job era pending ed è ancora pending
            // Terminates and removes from history jobs which are still
            // queued or running after the maximum allotted runtimes.
            else if (jobStatus.mainStatus !== 'COMPLETED') {
              let currentTime = new Date().getTime();
              if (jobStatus.mainStatus === 'QUEUED' &&
                      currentTime - Sec.jobs_[i].submitDate >
                          this.maxJobQueuedTime_ ||
                  jobStatus.mainStatus === 'RUNNING' &&
                      currentTime - Sec.jobs_[i].submitDate >
                          this.maxJobRunningTime_) {
                Logger.info(
                    'Job ' + Sec.jobs_[i].jobId + ' (' + Sec.jobs_[i].jobName +
                    ') has exceeded maximum ' + jobStatus.mainStatus +
                    ' runtime. Terminating.');
                when(
                    session.control(Sec.jobs_[i].jobId, session.TERMINATE),
                    (resp) => {
                      Logger.info(
                          'Removing job ' + Sec.jobs_[i].jobId + ' (' +
                          Sec.jobs_[i].jobName + ') from job history.');
                      Sec.jobs_.splice(i, 1);
                    });
              }
            }
            // Jobs whose execution ended within the maximum allotted runtimes
            // are removed from history.
            else if (jobStatus.mainStatus === 'COMPLETED') {
              Logger.info(
                  'Job ' + Sec.jobs_[i].jobId + ' (' + Sec.jobs_[i].jobName +
                  ') already terminated execution.');
              Logger.info(
                  'Removing job ' + Sec.jobs_[i].jobId + ' (' +
                  Sec.jobs_[i].jobName +
                  ') from job history. Current job history size: ' +
                  Sec.jobs_.length + '.');
              Sec.jobs_.splice(i, 1);
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
 * not made a request) for longer than the maximum alloted time (userLifespan_).
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
