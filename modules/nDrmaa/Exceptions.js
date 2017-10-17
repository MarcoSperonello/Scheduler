
/**
 * @fileoverview The exceptions used in the nDrmaa module.
 *
 * @author Andrea Gallina
 */

/**
 * The exceptions used in the nDrmaa module.
 * @module nDrmaaExceptions
 */

/**
 * Helper function for creating the exceptions.
 * @param exceptionName
 * @param {string} description - Error description.
 * @return {Error}
 * @private
 */
function _createException(exceptionName, description){
  let err = new Error(description);
  err.name = exceptionName;
  err.reason = description;
  return err;
}

/**
 * Session initialization failed due to an already existing DRMAA session.
 * @param {string} description - Error description.
 * @return {Error}
 * @constructor
 */
exports.AlreadyActiveSessionException = (description) => {
  return _createException("AlreadyActiveSessionException", description);
};

/**
 * DRM system initialization failed.
 * @param {string} description - Error description.
 * @return {Error}
 * @constructor
 */
exports.DrmsInitException = (description) => {
  return _createException("DrmsInitException", description);
};

/**
 * We have encountered a time-out condition for Session.synchronize() or Session.wait().
 * @param {string} description - Error description.
 * @return {Error}
 * @constructor
 */
exports.ExitTimeoutException = (description) => {
  return _createException("ExitTimeoutException", description);
};

/**
 * The input value for an argument is invalid.
 * @param {string} description - Error description.
 * @return {Error}
 * @constructor
 */
exports.InvalidArgumentException = (description) => {
  return _createException("InvalidArgumentException", description);
};

/**
 * Specified an invalid Session.
 * @param {string} description - Error description.
 * @return {Error}
 * @constructor
 */
exports.InvalidSessionException = (description) => {
  return _createException("InvalidSessionException", description);
};

/**
 * Requested action failed because there is no active session.
 * @param {string} description - Error description.
 * @return {Error}
 * @constructor
 */
exports.NoActiveSessionException = (description) => {
  return _createException("NoActiveSessionException", description);
};

/**
 * This exception is thrown when an unsupported option is passed for a job submission.
 * @param {string} description - Error description.
 * @return {Error}
 * @constructor
 */
exports.UnsupportedAttributeException = (description) => {
  return _createException("UnsupportedAttributeException", description);
};
