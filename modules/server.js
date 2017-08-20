import * as restify from 'restify';
import plugins from 'restify-plugins';
import {inspect} from 'util';

import Logger from './logger';

let _server = null;

export default class WS {
  constructor(handle, port) {

    if (!_server) {

      _server = restify.createServer({
        name: process.env.APP_NAME,
        formatters: {
          'text/csv': function formatCsv(req, res, body) {
            if (body instanceof Error)
              return body.stack;

            if (Buffer.isBuffer(body))
              return body.toString('base64');

            return inspect(body);
          }
        },
        log: Logger
      });

      /////////////////////////
      // DEFAULT MIDDLEWARES //
      ////////////////////////

      // init log object in req object passing some default parameters
      _server.use(plugins.requestLogger({}));
      // accept header
      _server.use(plugins.acceptParser(_server.acceptable));
      // always send gzipped response
      _server.use(plugins.gzipResponse());
      // parse authorization header
      _server.use(plugins.authorizationParser());
      // parse query string
      _server.use(plugins.queryParser());
      // enable json parsing ( yields objects :D )
      _server.use(plugins.jsonp());

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
      _server.pre((request, response, next) => {
        request.log.debug({req: request}, 'BEGIN');
        return next()
      });

      // log at the end of each request
      /*_server.on('after', plugins.auditLogger({
        log: Logger,
        server: _server
      }));*/

      // log request metrics in dev mode
      if (process.env.NODE_ENV === 'dev') {
        _server.on('after', plugins.metrics({
          server: _server
        }, (err, metrics, req, res, route) => {
          if (err) {
            req.log.info(err)
          }
          req.log.debug(`DONE. Request metrics:`, JSON.stringify(metrics));
        }))
      }

      ////////////////////////
      // REGISTER HANDLERS //
      ///////////////////////
      _start(handle);

      ////////////////////////////////////
      // START LISTENING ON GIVEN PORT //
      ///////////////////////////////////
      _server.listen(port, function () {
        _server.log.info(`Listening on port ${port}`)
      });
    }
    return _server
  }
}

function _start(handle) {
  for (let method in handle) {
    if (handle.hasOwnProperty(method)) {
      for (let name in handle[method]) {
        if (handle[method].hasOwnProperty(name)) {
          switch (method) {
            case "GET":
              console.log("handle[method][name][\"path\"] "+ handle[method][name]["path"]);
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

export function getRouter() {
  "use strict";
  return _server.router || null
}

export function getRoutes() {
  "use strict";
  return _server.router.routes || null
}
