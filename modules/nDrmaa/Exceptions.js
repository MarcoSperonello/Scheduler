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


exports.AlreadyActiveSessionException = (msg) => {
  return _createException("AlreadyActiveSessionException", msg);
};

exports.DrmsInitException = (msg) => {
  return _createException("DrmsInitException", msg);
};

exports.ExitTimeoutException = (msg) => {
  return _createException("ExitTimeoutException", msg);
};

exports.InvalidArgumentException = (msg) => {
  return _createException("InvalidArgumentException", msg);
};

exports.InvalidSessionArgument = (msg) => {
  return _createException("InvalidSessionArgument", msg);
};

exports.InvalidSessionException = (msg) => {
  return _createException("InvalidSessionException", msg);
};

exports.NoActiveSessionException = (msg) => {
  return _createException("NoActiveSessionException", msg);
};

exports.UnsupportedAttributeException = (msg) => {
  return _createException("UnsupportedAttributeException", msg);
};
