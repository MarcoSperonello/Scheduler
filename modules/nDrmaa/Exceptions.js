let exceptions = [
  "DrmsInitException",
  "ExitTimeoutException",
  "InvalidArgumentException",
  "InvalidSessionArgument",
  "InvalidSessionException",
  "UnsupportedAttributeException"
];


exceptions.forEach(function(exception){
  exports[exception]=function(msg){
    let err = new Error(msg);
    err.name=exception;
    return err;
  }
});