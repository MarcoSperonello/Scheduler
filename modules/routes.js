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
    'tapJobSubmission': {
      path: '/tap',
      handler: Handlers.handleTapJobSubmission
    },
    'frstJobSubmission': {
      path: '/frst',
      handler: Handlers.handleFrstJobSubmission
    },
  },
  'GET': {
    'root': {
      path: '/',
      handler: Handlers.handleRoot
    },
    'getServiceOutputFile': {
      path: 'get-results/:service/:sessionName/:outputFile',
      handler: Handlers.handleShowServiceOutputFile
    },
    'retrieveServiceResult': {
      path: 'get-results/:service/:sessionName',
      handler: Handlers.handleRetrieveServiceResult
    },
    'schedulerTest': {
      path: '/schedulerTest',
      handler: Handlers.handleSchedulerTest
    },
  },
};