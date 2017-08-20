'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getRouter = getRouter;
exports.getRoutes = getRoutes;

var _restify = require('restify');

var restify = _interopRequireWildcard(_restify);

var _restifyPlugins = require('restify-plugins');

var _restifyPlugins2 = _interopRequireDefault(_restifyPlugins);

var _util = require('util');

var _logger = require('./logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _server = null;

var WS = function WS(handle, port) {
  _classCallCheck(this, WS);

  if (!_server) {

    _server = restify.createServer({
      name: process.env.APP_NAME,
      formatters: {
        'text/csv': function formatCsv(req, res, body) {
          if (body instanceof Error) return body.stack;

          if (Buffer.isBuffer(body)) return body.toString('base64');

          return (0, _util.inspect)(body);
        }
      },
      log: _logger2.default
    });

    /////////////////////////
    // DEFAULT MIDDLEWARES //
    ////////////////////////

    // init log object in req object passing some default parameters
    _server.use(_restifyPlugins2.default.requestLogger({}));
    // accept header
    _server.use(_restifyPlugins2.default.acceptParser(_server.acceptable));
    // always send gzipped response
    _server.use(_restifyPlugins2.default.gzipResponse());
    // parse authorization header
    _server.use(_restifyPlugins2.default.authorizationParser());
    // parse query string
    _server.use(_restifyPlugins2.default.queryParser());
    // enable json parsing ( yields objects :D )
    _server.use(_restifyPlugins2.default.jsonp());

    /////////////////////////
    // CUSTOM MIDDLEWARES //
    ////////////////////////

    // allow cors (...)
    _server.pre(function (req, res, next) {

      //happily allow people to use the services (CORS!!)
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Authorization');

      if ('OPTIONS' === req.method) {
        res.send(200);
      } else {
        return next();
      }
    });

    // log at beginning at each call
    _server.pre(function (request, response, next) {
      request.log.debug({ req: request }, 'BEGIN');
      return next();
    });

    // log at the end of each request
    /*_server.on('after', plugins.auditLogger({
      log: Logger,
      server: _server
    }));*/

    // log request metrics in dev mode
    if (process.env.NODE_ENV === 'dev') {
      _server.on('after', _restifyPlugins2.default.metrics({
        server: _server
      }, function (err, metrics, req, res, route) {
        if (err) {
          req.log.info(err);
        }
        req.log.debug('DONE. Request metrics:', JSON.stringify(metrics));
      }));
    }

    ////////////////////////
    // REGISTER HANDLERS //
    ///////////////////////
    _start(handle);

    ////////////////////////////////////
    // START LISTENING ON GIVEN PORT //
    ///////////////////////////////////
    _server.listen(port, function () {
      _server.log.info('Listening on port ' + port);
    });
  }
  return _server;
};

exports.default = WS;


function _start(handle) {
  for (var method in handle) {
    if (handle.hasOwnProperty(method)) {
      for (var name in handle[method]) {
        if (handle[method].hasOwnProperty(name)) {
          switch (method) {
            case "GET":
              console.log("handle[method][name][\"path\"] " + handle[method][name]["path"]);
              _server.get({
                name: name,
                path: handle[method][name]["path"]
              }, handle[method][name]["handler"]);
              break;
            case "POST":
              _server.post({
                name: name,
                path: handle[method][name]["path"]
              }, handle[method][name]["handler"]);
              break;
            case "PUT":
              _server.put({
                name: name,
                path: handle[method][name]["path"]
              }, handle[method][name]["handler"]);
              break;
            case "DELETE":
              _server.del({
                name: name,
                path: handle[method][name]["path"]
              }, handle[method][name]["handler"]);
              break;
            default:
              _server.log.error("Handling of method '" + method + "' not implemented");
          }
        }
      }
    }
  }
}

function getRouter() {
  "use strict";

  return _server.router || null;
}

function getRoutes() {
  "use strict";

  return _server.router.routes || null;
}