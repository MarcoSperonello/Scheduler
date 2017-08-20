import Restify from 'restify';
import Bunyan from 'bunyan';

let _logger = null;

class Logger {
  constructor() {
    if (!_logger) {

      let streams = [];
      let enableSrc = false;

      if (process.env.NODE_ENV === 'dev') {
        // prepare configurations for dev
        streams = streams.concat([
          {stream: process.stdout, level: 'debug'},
          {path: process.env.LOG_PATH, level: 'trace'}
        ]);
        enableSrc = true

      } else if (process.env.NODE_ENV === 'test') {
        // prepare configurations for test
        streams.push({path: process.env.LOG_PATH, level: 'trace'});
        enableSrc = true

      } else {
        // prepare configuration for prod
        streams.push({stream: process.stdout, level: 'info'})
      }

      // init an instance of logger
      _logger = new Bunyan({
        name: 'mobidb3-logging-service',
        streams: streams,
        serializers: Restify.bunyan.serializers,
        src: enableSrc
      });

      _logger.info(`Welcome to test-ws! NODE_ENV is set to ${process.env.NODE_ENV}`);
    }
    return _logger
  }
}

export default new Logger()


// log.fatal('fatal error');
// log.error('some error occurred');
// log.warn('some warn');
// log.info('doing something cool...');
// log.debug('debug message');
// log.trace('trace');


