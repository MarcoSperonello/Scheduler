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
    }
  },
  'GET': {
    'root': {
      path: '/',
      handler: Handlers.handleRoot
    },
    'schedulerTest': {
      path: '/schedulerTest',
      handler: Handlers.handleSchedulerTest
    },
  },
};