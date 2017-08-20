"use strict";

import "babel-polyfill";

import {} from 'dotenv/config';

import WS from './modules/server';
import Handles from './modules/routes';
import Logger from './modules/logger';
import Db from './modules/database';

new WS(Handles, process.env.PORT);

// allow for graceful reload
process.on('exit', () => {
  Logger.info('Closing db session before exit...');
  gracefulStop()
});
process.on('SIGINT', () => {
  Logger.info('SIGINT detected. Closing db session...');
  gracefulStop()
});
process.on('SIGTERM', () => {
  Logger.info('SIGTERM detected. Closing db session...');
  gracefulStop()
});
process.on('SIGQUIT', () => {
  Logger.info('SIGQUIT detected. Closing db session...');
  gracefulStop()
});

function gracefulStop() {
  Db.stop().then(() => {
    Logger.info('MongoDB connection successfully closed.');
    process.exit();

  }).catch((err) => {
    Logger.error(err);
    process.exit(1);
  });
}