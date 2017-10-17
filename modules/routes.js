import Handlers from './handlers'

export default {
  'POST': {
    'submitJob': {
      path: '/submit',
      handler: Handlers.handleJobSubmission
    },
    'waitJob': {
      path: '/wait',
      handler: Handlers.handleJobExecution
    },
    'schedulerTest': {
      path: '/schedulerTest',
      handler: Handlers.handleSchedulerTest
    },
    'tapJobTest': {
      path: '/tap',
      handler: Handlers.handleTapJobSubmission
    },
    'frstJobTest': {
      path: '/frst',
      handler: Handlers.handleFrstJobSubmission
    },
  },
  'GET': {
    'root': {
      path: '/',
      handler: Handlers.handleRoot
    },
    'getTapOutputFile': {
      path: 'get-results/tap/:sessionName/:outputFile',
      handler: Handlers.handleShowTapOutFile
    },
    'retrieveTapResult': {
      path: 'get-results/tap/:sessionName',
      handler: Handlers.handleRetrieveTapResult
    },
    'schedulerTest': {
      path: '/schedulerTest',
      handler: Handlers.handleSchedulerTest
    },
  },
};