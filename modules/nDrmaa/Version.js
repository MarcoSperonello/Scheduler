/**
 * @fileoverview Class representing the version of a DRMS
 *
 * @author Andrea Gallina
 */

import * as Exceptions from "./Exceptions";

/**
 * Class representing the version of a DRMS
 */
class Version {
  /**
   * Creates a Version instance
   * @param {number|string} major - Major version number
   * @param {number|string} minor - Minor version number
   */
  constructor(major,minor){
    /**
     * Major version number.
     * @type {string}
     */
    this.major = "";

    /**
     * Minor version number.
     * @type {string}
     */
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

export default Version;
