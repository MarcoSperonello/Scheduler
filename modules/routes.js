import Handlers from './handlers'

export default {
  'POST': {
    'scheduler': {
      path: '/scheduler',
      handler: Handlers.handleScheduler
    }
  },
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