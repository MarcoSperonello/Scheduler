let exceptions = [
  "DeniedByDrmsException",
  "DrmCommunicationException",
  "TryLaterException",
  "TimeoutException",
  "InternalException",
  "InvalidArgumentException",
  "InvalidSessionArgument",
  "InvalidStateException",
  "OutOfResourceException",
  "UnsupportedAttributeException",
  "UnsupportedOperationException",
  "ImplementationSpecificException"
];


exceptions.forEach(function(c){
  exports[c]=function(msg){
    //Error.call(this,msg);
    let err = new Error(msg);
    err.name=c;
    return err;
  }
});