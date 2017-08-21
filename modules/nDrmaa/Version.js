export default class Version {
  constructor(major,minor){
    this.major = ""
    this.minor = ""

    if (typeof major!=='object'){
      this.major=major;
      this.minor=minor;
    }
    else{
      for (var prop in major){
        this[prop]=major[prop];
      }
    }
  }

}
