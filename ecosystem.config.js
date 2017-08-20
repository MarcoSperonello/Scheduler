const ver = '1.0.0';

module.exports = {
  /**
   * Application configuration section
   * http://pm2.keymetrics.io/docs/usage/application-declaration/
   */
  apps : [

    // First application
    {
      interpreter : '/home/marco/.nvm/versions/node/v6.11.2/bin/node',
      name      : 'template-ws',
      script    : './dist/init_ws.js',
      cwd: ".",
      watch: true,
      ignore_watch: ["node_modules", "log", "test", "dist"],
      merge_logs: true,
      autorestart: true,

      env: {
        NODE_ENV        : 'dev',
        COMMON_VARIABLE : 'true',
        MONGO_DB_COLL_NAME : 'test'
      },
      env_production : {
        APP_NAME           : 'template-ws',
        PATH               : 'node-v6.11.0-linux-x64/bin:$PATH',
        NODE_ENV           : 'prod',
        COMMON_VARIABLE    : 'true',
        PORT               : 8092,
        VERSION            : ver,
        MONGO_BASE_URL     : '172.21.2.70',
        MONGO_PORT         : 27017,
        MONGO_DB_NAME      : 'mobidb3',
        MONGO_DB_COLL_NAME : 'test',
        DB_FOLDER          : '/db',
        PDB_DB             : '/db/pdb',
        DEV_MAIL           : 'biocomp@bio.unipd.it',
        LOG_PATH           : null
      }
    },
    // Second application
    // {
    //   name      : 'WEB',
    //   script    : 'web.js's
    // }
  ],

  /**
   * Deployment section
   * http://pm2.keymetrics.io/docs/usage/deployment/
   */
  deploy : {
    production : {
      user          : 'biocomp',
      host          : 'caronte',
      ref           : 'origin/master',
      repo          : 'stige:/home/git/mobidb3-ws.git',
      path          : '/var/nodejs/mobidb3',
      'post-deploy' : 'npm install --production && pm2 startOrReload ecosystem.config.js --env production'
    },
    // dev : {
    //   user : 'ftabaro',
    //   host : 'localhost',
    //   ref  : 'origin/master',
    //   repo : 'git@172.21.2.100:/home/git/mobidb3-ws.git',
    //   path : '.',
    //   // 'post-deploy' : 'npm install && pm2 reload ecosystem.config.js --env dev',
    //   env  : {
    //     NODE_ENV: 'dev'
    //   }
    // }
  }
};
