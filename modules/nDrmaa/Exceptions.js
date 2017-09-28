let exceptions = [
  "AlreadyActiveSessionException",
  "DrmsInitException",
  "ExitTimeoutException",
  "InvalidArgumentException",
  "InvalidSessionArgument",
  "InvalidSessionException",
  "NoActiveSessionException",
  "UnsupportedAttributeException"
];


exceptions.forEach((exception) => {
  exports[exception] = (msg) => {
    let err = new Error(msg);
    err.name = exception;
    return err;
  }
});