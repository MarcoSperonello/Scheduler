let exceptions = [
  "DeniedByDrmsException",
  "DrmCommunicationException",
  "TryLaterException",
  "ExitTimeoutException",
  "InternalException",
  "InvalidArgumentException",
  "InvalidSessionArgument",
  "InvalidStateException",
  "OutOfResourceException",
  "UnsupportedAttributeException",
  "UnsupportedOperationException",
  "ImplementationSpecificException"
];


exceptions.forEach(function(exception){
  exports[exception]=function(msg){
    let err = new Error(msg);
    err.name=exception;
    return err;
  }
});