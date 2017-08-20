"use strict";

require("babel-polyfill");

require("dotenv/config");

var _server = require("./modules/server");

var _server2 = _interopRequireDefault(_server);

var _routes = require("./modules/routes");

var _routes2 = _interopRequireDefault(_routes);

var _logger = require("./modules/logger");

var _logger2 = _interopRequireDefault(_logger);

var _database = require("./modules/database");

var _database2 = _interopRequireDefault(_database);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

new _server2.default(_routes2.default, process.env.PORT);

// allow for graceful reload
process.on('exit', function () {
  _logger2.default.info('Closing db session before exit...');
  gracefulStop();
});
process.on('SIGINT', function () {
  _logger2.default.info('SIGINT detected. Closing db session...');
  gracefulStop();
});
process.on('SIGTERM', function () {
  _logger2.default.info('SIGTERM detected. Closing db session...');
  gracefulStop();
});
process.on('SIGQUIT', function () {
  _logger2.default.info('SIGQUIT detected. Closing db session...');
  gracefulStop();
});

function gracefulStop() {
  _database2.default.stop().then(function () {
    _logger2.default.info('MongoDB connection successfully closed.');
    process.exit();
  }).catch(function (err) {
    _logger2.default.error(err);
    process.exit(1);
  });
}
//# sourceMappingURL=init_ws.js.map