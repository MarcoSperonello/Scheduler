'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.basicAuth = basicAuth;
exports.login = login;
exports.create_user = create_user;
exports.delete_user = delete_user;
exports.accept_user = accept_user;
exports.validate_email = validate_email;
exports.reset_password = reset_password;

var _winston = require('winston');

var logger = _interopRequireWildcard(_winston);

var _bcrypt = require('bcrypt');

var bcrypt = _interopRequireWildcard(_bcrypt);

var _formidable = require('formidable');

var formidable = _interopRequireWildcard(_formidable);

var _restify = require('restify');

var restify = _interopRequireWildcard(_restify);

var _cookie = require('cookie');

var cookie = _interopRequireWildcard(_cookie);

var _crypto = require('crypto');

var _database = require('./database');

var _server = require('./server');

var _aux = require('./aux');

var aux = _interopRequireWildcard(_aux);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

var saltRounds = 10; /**
                      * Created by francesco on 11/04/17.
                      */

function basicAuth(req, res, next) {

  res.header('WWW-Authenticate', 'Basic realm="VHLdb"');

  var user_object = void 0;
  if (req.headers.hasOwnProperty('cookie')) {
    user_object = JSON.parse(cookie.parse(decodeURIComponent(req.headers.cookie)).user_object || '{}');
    user_object = user_object.currentUser;
  }

  if (user_object && user_object.hasOwnProperty('username')) {

    _database.db.performFindOne({ username: user_object.username }, {}, 'users').then(function (user) {
      if (user && user.active && user.verified_email) {
        logger.log('info', 'checkUser | %s | Cookie session detected. %s request OK.', req.connection.remoteAddress, user.username);
        req.user = user;
        return next();
      } else {
        var error = new restify.errors.NotFoundError('Invalid credentials.');
        res.send(error);
        return next(error);
      }
    }).catch(function () {
      var error = new restify.errors.NotFoundError('Could not fetch user.');
      res.send(error);
      return next(error);
    });
  } else if (req.headers.hasOwnProperty('authorization')) {

    var username = req.authorization.basic.username;
    var passwd = req.authorization.basic.password;

    _database.db.performFindOne({ username: username }, {}, 'users').then(function (user) {

      if (!user) {
        var error = new restify.errors.NotFoundError('User not found.');
        res.send(error);
        return next(error);
      } else if (user.active && user.verified_email) {
        bcrypt.compare(passwd, user.pw, function (err, authorized) {
          if (err || !authorized) {
            logger.log('info', 'checkUser | %s | unauthorized request', req.connection.remoteAddress);
            if (err) {
              logger.log('error', 'checkUser | %s | %s', req.connection.remoteAddress, err);
            }
            res.send(401);
            return next(false);
          } else {
            logger.log('info', 'checkUser | %s | %s request. OK.', req.connection.remoteAddress, user.username);
            delete user.pw;
            req.user = user;
            return next();
          }
        });
      } else if (!user.active && user.verified_email) {
        var _error = new restify.errors.UnauthorizedError('This account need to be activated.');
        res.send(_error);
        return next(_error);
      } else {
        var _error2 = new restify.errors.UnauthorizedError('The email address associated with this address needs verification. Check your inbox.');
        res.send(_error2);
        return next(_error2);
      }
    });
  } else {
    var error = new restify.errors.BadRequestError('This route requires authorization.');
    res.send(error);
    return next(error);
  }
}

function login(req, res, next) {
  var data = '';
  req.on('data', function (chunk) {
    data += chunk;
  });

  req.on('end', function () {
    res.send(204);
    return next();
  });

  req.on('error', function () {
    res.send(400);
  });
}

function create_user(req, res, next) {

  /**
   * fields:
   *  -   user        -> username
   *  -   password    -> user secret password
   *  -   name        -> first name
   *  -   surname     -> surname
   *  -   email       -> email address
   */

  var form = new formidable.IncomingForm();

  form.parse(req, function (err, fields) {
    if (!fields.hasOwnProperty('user') || !fields.hasOwnProperty('email') || !fields.hasOwnProperty('password')) {
      res.send(400);
    }

    if (fields.hasOwnProperty('password')) {

      bcrypt.hash(fields.password, saltRounds, function (err, hash) {
        (0, _crypto.randomBytes)(48, function (err, validation_buffer) {

          var user_object = {
            name: fields.name,
            username: fields.user,
            pw: hash,
            email: fields.email,
            active: false,
            verified_email: false,
            validation_string: validation_buffer.toString('hex'),
            registration_date: new Date()
          };
          if (typeof fields.surname != 'undefined') {
            user_object.surname = fields.surname;
          }

          _database.db.performInsertOne(user_object, 'users').then(function (result) {

            var validate_link = 'http://' + req.headers.host + '/ws' + _server.server.router.render('validate_email', { validation_string: validation_buffer.toString('hex') });

            var message = {
              from: "biocomp@bio.unipd.it",
              cc: process.env.dev_email,
              to: fields.email,
              subject: "[VHLdb] Validate your email address",
              text: 'Click here to validate your email address: ' + validate_link
            };

            aux.send_message(message);

            res.send(201, result);
            return next();
          }, function (error) {
            logger.log('error', 'create_user | %s | %s', req.connection.remoteAddress, error);
            res.send(new restify.errors.InternalServerError(error));
            return next(error);
          });
        });
      });
    } else {

      var error = new restify.errors.BadRequestError('Could not detect password.');
      logger.log('error', 'create_user | %s | %s', req.connection.remoteAddress, error);
      res.send(error);
      return next(error);
    }
  });
}

function delete_user(req, res, next) {

  _database.db.performRemove({ _id: aux.to_objectid(req.params.user_id) }, 'users').then(function (result) {
    if (result.ok) {
      res.send(200);
      return next();
    } else {

      var error = restify.errors.InternalServerError('Could not remove user ' + req.params.user_id);
      res.send(error);
      return next(error);
    }
  }, function (error) {
    res.send(500);
    logger.log('error', '%s | %s', req.connection.remoteAddress, error);
  });
}

function accept_user(req, res, next) {

  var filter_object = { _id: aux.to_objectid(req.params.user_id) };
  var error = void 0;

  // check if user is already active
  _database.db.performFindOne(filter_object, { active: 1 }, 'users').then(function (user) {

    if (!user) {
      error = new restify.errors.NotFoundError('Could not find the requested link.');
      res.send(error);
      return next(error);
    }

    if (user.active) {
      error = new restify.errors.ConflictError('user is already active.');
      res.send(error);
      return next(error);
    }

    // if not active activate it
    _database.db.performFindOneAndModify(filter_object, {
      $set: {
        active: {
          active: true,
          date: new Date()
        }
      }
    }, 'users').then(function (user) {

      logger.log('info', 'accept_user | %s | user %s accepted.', req.connection.remoteAddress, user.username);
      res.send(200, { 'message': user.username + ' is now active.' });
      return next();
    }, function (error) {

      logger.log('error', 'accept_user | %s | %s', req.connection.remoteAddress, error);
      res.send(500);
      return next(error);
    });
  }, function (error) {

    logger.log('error', 'accept_user | %s | %s', req.connection.remoteAddress, error);
    res.send(500);
    return next(error);
  });
}

function validate_email(req, res, next) {
  var error = void 0;

  (0, _crypto.randomBytes)(48, function (err, new_validation_buffer) {

    if (err) {
      error = restify.errors.InternalServerError(err);
      logger.log('error', '%s | %s', req.connection.remoteAddress, error);
      res.send(error);
      return next(error);
    }

    _database.db.performFindOneAndModify({ validation_string: req.params.validation_string }, {
      $set: {
        verified_email: { verified: true, date: new Date() },
        validation_string: new_validation_buffer.toString('hex')
      }
    }, 'users').then(function (user) {

      if (user) {
        var name = user.hasOwnProperty('surname') ? user.name + ' ' + user.surname : user.name;
        var accept_link = 'http://' + req.headers.host + '/ws' + _server.server.router.render('accept_registration', { user_id: user._id });
        var sender = 'New registration request from ' + user.name + ' (' + user.email + ').';
        var message = {
          from: "biocomp@bio.unipd.it",
          to: "biocomp@bio.unipd.it",
          cc: process.env.dev_email,
          subject: '[VHLdb] Registration request from ' + name,
          text: sender + ('\n\nClick here to accept the registration: ' + accept_link + '\n\n\nCheers,\nVHLdb dev team')
        };

        aux.send_message(message);
        res.send(200, { message: 'email verified' });
        return next();
      } else {
        error = new restify.errors.NotFoundError('Could not find the requested link.');
        res.send(error);
        return next(error);
      }
    }, function (error) {

      error = restify.errors.InternalServerError('Error while validating email.');
      logger.log('error', '%s | %s', req.connection.remoteAddress, error);
      res.send(error);
      return next(error);
    });
  });
}

function reset_password(req, res, next) {
  // codeme: reset_password
}