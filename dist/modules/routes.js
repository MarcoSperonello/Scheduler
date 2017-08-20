'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _handlers = require('./handlers');

var _handlers2 = _interopRequireDefault(_handlers);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

exports.default = {
  'POST': {},
  'GET': {
    'root': {
      path: '/',
      handler: _handlers2.default.handleRoot
    },
    'test': {
      path: '/test',
      handler: _handlers2.default.handleTest
    },
    'scheduler': {
      path: '/scheduler',
      handler: _handlers2.default.handleScheduler
    }
  }
};