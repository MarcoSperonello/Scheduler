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
  },
  'GET': {
    'root': {
      path: '/',
      handler: Handlers.handleRoot
    },
    'getTapResult': {
      path: '/tap/:sessionName/:outputFile',
      handler: Handlers.handleTapResult
    },
    'schedulerTest': {
      path: '/schedulerTest',
      handler: Handlers.handleSchedulerTest
    },
  },
};