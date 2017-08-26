import Handlers from './handlers'

export default {
  'POST': {},
  'GET': {
    'root': {
      path: '/',
      handler: Handlers.handleRoot
    },
    'scheduler': {
        path: '/scheduler',
        handler: Handlers.handleScheduler
    },
    'submitJob': {
      path: '/submit',
      handler: Handlers.handleSubmitJob
    }
  },
};