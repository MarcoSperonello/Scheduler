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
    'closeSession': {
      path: '/closeSession',
      handler: Handlers.handleSessionDeletion
    }
  },
  'GET': {
    'root': {
      path: '/',
      handler: Handlers.handleRoot
    }
  },
};