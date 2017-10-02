import * as Exceptions from "./Exceptions";

/**
 * Class representing the version of a DRMS
 */
export default class Version {
  /**
   * Creates a Version instance
   * @param {number|string} major - Major version number
   * @param {number|string} minor - Minor version number
   */
  constructor(major,minor){
    this.major = "";
    this.minor = "";

    if ((typeof major==='string' && typeof minor==='string') || (!isNaN(major) && !isNaN(minor))){
      this.major=major;
      this.minor=minor;
    }
    else{
      throw new Exceptions.InvalidArgumentException("Invalid argument type for Version");
    }
  }

}
