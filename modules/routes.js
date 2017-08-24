import Handlers from './handlers'

export default {
  'POST': {},
  'GET': {
    'root': {
      path: '/',
      handler: Handlers.handleRoot
    },
    'test': {
      path: '/test',
      handler: Handlers.handleTest
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