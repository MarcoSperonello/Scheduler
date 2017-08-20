'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _restify = require('restify');

var _restify2 = _interopRequireDefault(_restify);

var _bunyan = require('bunyan');

var _bunyan2 = _interopRequireDefault(_bunyan);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _logger = null;

var Logger = function Logger() {
  _classCallCheck(this, Logger);

  if (!_logger) {

    var streams = [];
    var enableSrc = false;

    if (process.env.NODE_ENV === 'dev') {
      // prepare configurations for dev
      streams = streams.concat([{ stream: process.stdout, level: 'debug' }, { path: process.env.LOG_PATH, level: 'trace' }]);
      enableSrc = true;
    } else if (process.env.NODE_ENV === 'test') {
      // prepare configurations for test
      streams.push({ path: process.env.LOG_PATH, level: 'trace' });
      enableSrc = true;
    } else {
      // prepare configuration for prod
      streams.push({ stream: process.stdout, level: 'info' });
    }

    // init an instance of logger
    _logger = new _bunyan2.default({
      name: 'mobidb3-logging-service',
      streams: streams,
      serializers: _restify2.default.bunyan.serializers,
      src: enableSrc
    });

    _logger.info('Welcome to test-ws! NODE_ENV is set to ' + process.env.NODE_ENV);
  }
  return _logger;
};

exports.default = new Logger();

// log.fatal('fatal error');
// log.error('some error occurred');
// log.warn('some warn');
// log.info('doing something cool...');
// log.debug('debug message');
// log.trace('trace');