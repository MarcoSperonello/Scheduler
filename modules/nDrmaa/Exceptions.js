// let exceptions = [
//   "AlreadyActiveSessionException",
//   "DrmsInitException",
//   "ExitTimeoutException",
//   "InvalidArgumentException",
//   "InvalidSessionArgument",
//   "InvalidSessionException",
//   "NoActiveSessionException",
//   "UnsupportedAttributeException"
// ];


// exceptions.forEach((exception) => {
//   exports[exception] = (msg) => {
//     let err = new Error(msg);
//     err.name = exception;
//     return err;
//   }
// });

/**
 * The exceptions used in the nDrmaa module.
 * @module nDrmaaExceptions
 */

/**
 * Helper function for creating the exceptions.
 * @param exceptionName
 * @param msg
 * @return {Error}
 * @private
 */
function _createException(exceptionName, msg){
  let err = new Error(msg);
  err.name = exceptionName;
  return err;
}

/**
 * Session initialization failed due to an already existing DRMAA session.
 * @param msg
 * @return {Error}
 * @constructor
 */
exports.AlreadyActiveSessionException = (msg) => {
  return _createException("AlreadyActiveSessionException", msg);
};

/**
 * DRM system initialization failed.
 * @param msg
 * @return {Error}
 * @constructor
 */
exports.DrmsInitException = (msg) => {
  return _createException("DrmsInitException", msg);
};

/**
 * We have encountered a time-out condition for Session.synchronize() or Session.wait().
 * @param msg
 * @return {Error}
 * @constructor
 */
exports.ExitTimeoutException = (msg) => {
  return _createException("ExitTimeoutException", msg);
};

/**
 * The input value for an argument is invalid.
 * @param msg
 * @return {Error}
 * @constructor
 */
exports.InvalidArgumentException = (msg) => {
  return _createException("InvalidArgumentException", msg);
};

/**
 * Specified an invalid Session.
 * @param msg
 * @return {Error}
 * @constructor
 */
exports.InvalidSessionException = (msg) => {
  return _createException("InvalidSessionException", msg);
};

/**
 * Requested action failed because there is no active session.
 * @param msg
 * @return {Error}
 * @constructor
 */
exports.NoActiveSessionException = (msg) => {
  return _createException("NoActiveSessionException", msg);
};

/**
 * This exception is thrown when an unsupported option is passed for a job submission.
 * @param msg
 * @return {Error}
 * @constructor
 */
exports.UnsupportedAttributeException = (msg) => {
  return _createException("UnsupportedAttributeException", msg);
};
