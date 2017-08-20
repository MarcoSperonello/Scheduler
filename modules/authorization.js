/**
 * Created by francesco on 11/04/17.
 */

import * as logger from 'winston';
import * as bcrypt from 'bcrypt';
import * as formidable from 'formidable';
import * as restify from 'restify';
import * as cookie from 'cookie';
import {randomBytes as randomBytes} from 'crypto';

import {db} from './database';
import {server as Server} from './server';
import * as aux from './aux';

const saltRounds = 10;

export function basicAuth(req, res, next) {

  res.header('WWW-Authenticate', 'Basic realm="VHLdb"');

  let user_object;
  if (req.headers.hasOwnProperty('cookie')) {
    user_object = JSON.parse(cookie.parse(decodeURIComponent(req.headers.cookie)).user_object || '{}');
    user_object = user_object.currentUser;
  }

  if (user_object && user_object.hasOwnProperty('username')) {

    db.performFindOne({username: user_object.username}, {}, 'users').then((user) => {
      if (user && user.active && user.verified_email) {
        logger.log('info', 'checkUser | %s | Cookie session detected. %s request OK.', req.connection.remoteAddress, user.username);
        req.user = user;
        return next()

      } else {
        let error = new restify.errors.NotFoundError('Invalid credentials.');
        res.send(error);
        return next(error);
      }
    }).catch(() => {
      let error = new restify.errors.NotFoundError('Could not fetch user.');
      res.send(error);
      return next(error);
    })

  } else if (req.headers.hasOwnProperty('authorization')) {

    const username = req.authorization.basic.username;
    const passwd = req.authorization.basic.password;

    db.performFindOne({username: username}, {}, 'users').then(function (user) {

      if (!user) {
        let error = new restify.errors.NotFoundError('User not found.');
        res.send(error);
        return next(error);

      } else if (user.active && user.verified_email) {
        bcrypt.compare(passwd, user.pw, (err, authorized) => {
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
            return next()
          }
        })

      } else if (!user.active && user.verified_email) {
        let error = new restify.errors.UnauthorizedError('This account need to be activated.');
        res.send(error);
        return next(error)

      } else {
        let error = new restify.errors.UnauthorizedError('The email address associated with this address needs verification. Check your inbox.');
        res.send(error);
        return next(error)
      }
    });
  } else {
    let error = new restify.errors.BadRequestError('This route requires authorization.');
    res.send(error);
    return next(error)
  }
}

export function login(req, res, next) {
  let data = '';
  req.on('data', (chunk) => {
    data += chunk;
  });

  req.on('end', () => {
    res.send(204);
    return next()
  });

  req.on('error', () => {
    res.send(400);
  })
}

export function create_user(req, res, next) {

  /**
   * fields:
   *  -   user        -> username
   *  -   password    -> user secret password
   *  -   name        -> first name
   *  -   surname     -> surname
   *  -   email       -> email address
   */

  const form = new formidable.IncomingForm();

  form.parse(req, (err, fields) => {
    if (!fields.hasOwnProperty('user') || !fields.hasOwnProperty('email') || !fields.hasOwnProperty('password')) {
      res.send(400)
    }

    if (fields.hasOwnProperty('password')) {

      bcrypt.hash(fields.password, saltRounds, (err, hash) => {
        randomBytes(48, (err, validation_buffer) => {

          let user_object = {
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

          db.performInsertOne(user_object, 'users').then((result) => {

            const validate_link = 'http://' + req.headers.host + '/ws' + Server.router.render('validate_email', {validation_string: validation_buffer.toString('hex')});

            const message = {
              from: "biocomp@bio.unipd.it",
              cc: process.env.dev_email,
              to: fields.email,
              subject: "[VHLdb] Validate your email address",
              text: `Click here to validate your email address: ${validate_link}`
            };

            aux.send_message(message);

            res.send(201, result);
            return next();

          }, (error) => {
            logger.log('error', 'create_user | %s | %s', req.connection.remoteAddress, error);
            res.send(new restify.errors.InternalServerError(error));
            return next(error);
          })
        })
      })


    } else {

      let error = new restify.errors.BadRequestError('Could not detect password.');
      logger.log('error', 'create_user | %s | %s', req.connection.remoteAddress, error);
      res.send(error);
      return next(error);

    }
  });
}

export function delete_user(req, res, next) {

  db.performRemove({_id: aux.to_objectid(req.params.user_id)}, 'users').then((result) => {
    if (result.ok) {
      res.send(200);
      return next();
    } else {

      let error = restify.errors.InternalServerError(`Could not remove user ${req.params.user_id}`);
      res.send(error);
      return next(error);
    }
  }, (error) => {
    res.send(500);
    logger.log('error', '%s | %s', req.connection.remoteAddress, error)
  })

}

export function accept_user(req, res, next) {

  let filter_object = {_id: aux.to_objectid(req.params.user_id)};
  let error;

  // check if user is already active
  db.performFindOne(filter_object, {active: 1}, 'users').then((user) => {

    if (!user) {
      error = new restify.errors.NotFoundError('Could not find the requested link.');
      res.send(error);
      return next(error);
    }

    if (user.active) {
      error = new restify.errors.ConflictError('user is already active.');
      res.send(error);
      return next(error)
    }

    // if not active activate it
    db.performFindOneAndModify(filter_object, {
      $set: {
        active: {
          active: true,
          date: new Date()
        }
      }
    }, 'users').then((user) => {

      logger.log('info', 'accept_user | %s | user %s accepted.', req.connection.remoteAddress, user.username);
      res.send(200, {'message': `${user.username} is now active.`});
      return next()

    }, (error) => {

      logger.log('error', 'accept_user | %s | %s', req.connection.remoteAddress, error);
      res.send(500);
      return next(error)

    })

  }, (error) => {

    logger.log('error', 'accept_user | %s | %s', req.connection.remoteAddress, error);
    res.send(500);
    return next(error)

  });

}

export function validate_email(req, res, next) {
  let error;

  randomBytes(48, (err, new_validation_buffer) => {

    if (err) {
      error = restify.errors.InternalServerError(err);
      logger.log('error', '%s | %s', req.connection.remoteAddress, error);
      res.send(error);
      return next(error);
    }

    db.performFindOneAndModify({validation_string: req.params.validation_string}, {
      $set: {
        verified_email: {verified: true, date: new Date()},
        validation_string: new_validation_buffer.toString('hex')
      }
    }, 'users').then((user) => {

      if (user) {
        const name = user.hasOwnProperty('surname') ? user.name + ' ' + user.surname : user.name;
        const accept_link = 'http://' + req.headers.host + '/ws' + Server.router.render('accept_registration', {user_id: user._id});
        const sender = `New registration request from ${user.name} (${user.email}).`;
        const message = {
          from: "biocomp@bio.unipd.it",
          to: "biocomp@bio.unipd.it",
          cc: process.env.dev_email,
          subject: `[VHLdb] Registration request from ${name}`,
          text: sender + `\n\nClick here to accept the registration: ${accept_link}\n\n\nCheers,\nVHLdb dev team`
        };

        aux.send_message(message);
        res.send(200, {message: 'email verified'});
        return next();

      } else {
        error = new restify.errors.NotFoundError('Could not find the requested link.');
        res.send(error);
        return next(error)
      }

    }, (error) => {

      error = restify.errors.InternalServerError('Error while validating email.');
      logger.log('error', '%s | %s', req.connection.remoteAddress, error);
      res.send(error);
      return next(error);

    })
  })
}

export function reset_password(req, res, next) {
  // codeme: reset_password
}