'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _restifyErrors = require('restify-errors');

var errors = _interopRequireWildcard(_restifyErrors);

var _restifyPlugins = require('restify-plugins');

var _restifyPlugins2 = _interopRequireDefault(_restifyPlugins);

var _aux = require('./aux');

var _aux2 = _interopRequireDefault(_aux);

var _database = require('./database');

var _database2 = _interopRequireDefault(_database);

var _server = require('./server');

var _schedulerSecurity = require('./scheduler-security');

var _schedulerSecurity2 = _interopRequireDefault(_schedulerSecurity);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

exports.default = {

  handleRoot: function handleRoot(req, res, next) {
    req.log.info('request handler is ' + handleRoot.name);
    var routes = (0, _server.getRoutes)();
    var ret_routes = {};
    for (var method in routes) {
      console.log("method " + method);
      if (routes.hasOwnProperty(method)) {
        ret_routes[method] = [];
        for (var i = 0; i < routes[method].length; i++) {
          var r = routes[method][i]['spec'];
          delete r['versions'];
          delete r['method'];
          ret_routes[method].push(r);
        }
      }
    }
    res.send(200, ret_routes);
    return next();
  },

  handleTest: function handleTest(req, res, next) {
    req.log.info('request handler is ' + handleTest.name);

    var requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var requestData = {
      ip: requestIp,
      time: req.time()
    };
    _database2.default.performInsertOne(requestData, "test");

    /*var cursor = Db.performFind({ ip: "::ffff:127.0.0.1" }, { ip: 1, time: 1}, "test");
    cursor.forEach( (docs) => {
        console.log(docs["time"]);
    }, (err) => {
        console.log("error");
    });*/

    console.log("req path " + req.path());

    res.send(200, "test");

    return next();
  },

  handleScheduler: function handleScheduler(req, res, next) {
    req.log.info('request handler is ' + handleScheduler.name);

    var requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    var requestData = {
      ip: requestIp,
      time: req.time()
    };

    _schedulerSecurity2.default.handleRequest(requestData);
    //Sec.addJob(req.query["jobfile"]);
    //Sec.pollJobs("simple.sh");

    res.send(200, "done");

    return next();
  }
};