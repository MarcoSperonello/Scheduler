import Handlers from './handlers'

export default {
  'POST': {
    'submitJob': {
      path: '/submit',
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
    }
  },
};