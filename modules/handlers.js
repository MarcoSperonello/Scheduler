import * as errors from 'restify-errors';
import plugins from 'restify-plugins';


import aux from './aux';

import Db from './database';
import {getRoutes} from './server';
import Sec from './scheduler-security';

export default {

  handleRoot: function handleRoot(req, res, next) {
    req.log.info(`request handler is ${handleRoot.name}`);
    const routes = getRoutes();
    const ret_routes = {};
      for (let method in routes) {
        console.log("method " + method);
      if (routes.hasOwnProperty(method)) {
        ret_routes[method] = [];
        for (let i = 0; i < routes[method].length; i++) {
          let r = routes[method][i]['spec'];
          delete r['versions'];
          delete r['method'];
          ret_routes[method].push(r);
        }
      }
    }
    res.send(200, ret_routes);
    return next()
  },

  handleTest: function handleTest(req, res, next) {
      req.log.info(`request handler is ${handleTest.name}`);

      var requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      var requestData = {
        ip: requestIp,
        time: req.time()
      };
      Db.performInsertOne(requestData, "test");

      /*var cursor = Db.performFind({ ip: "::ffff:127.0.0.1" }, { ip: 1, time: 1}, "test");
      cursor.forEach( (docs) => {
          console.log(docs["time"]);
      }, (err) => {
          console.log("error");
      });*/

      console.log("req path " + req.path());

      res.send(200, "test");

      return next()
  },

  handleScheduler: function handleScheduler(req, res, next) {
      req.log.info(`request handler is ${handleScheduler.name}`);

      var requestIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      var requestData = {
          ip: requestIp,
          time: req.time()
      };

      Sec.handleRequest(requestData);
      //Sec.addJob(req.query["jobfile"]);
      //Sec.pollJobs("simple.sh");

      res.send(200, "done");

      return next()
  }
}