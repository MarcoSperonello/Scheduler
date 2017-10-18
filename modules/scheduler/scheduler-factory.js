/**
 * @fileoverview Class that manages instantiation, retrieval and deletion of
 * [SchedulerManager]{@link scheduler/SchedulerManager} objects.
 *
 * @author Marco Speronello
 */
import {SchedulerManager} from './scheduler-manager';

// Array storing SchedulerManager instances.
let schedulers_ = [];

/**
 * Class that manages instantiation and retrieval and deletion of
 * [SchedulerManager]{@link scheduler/SchedulerManager} objects.
 *
 * @alias scheduler/SchedulerFactory
 */
class SchedulerFactory {
  /**
   * Initializes an instance of the class.
   */
  constructor() { console.log('Initialized SchedulerFactory.'); }

  /**
   * Creates a [SchedulerManager]{@link scheduler/SchedulerManager} object.
   *
   * @param {string} name - The name of the [SchedulerManager]{@link
   * scheduler/SchedulerManager} to create.
   * @param {string} inputFile - The path of the file with the
   * [SchedulerManager]{@link scheduler/SchedulerManager} input parameters.
   * @returns {scheduler/SchedulerManager} The newly created SchedulerManager.
   * @throws {Error} The name provided was null or an empty string, or a
   * [SchedulerManager]{@link scheduler/SchedulerManager} with this name already
   * exists.
   */
  createSchedulerManager(name, inputFile) {
    if (name === '' || name === null) {
      console.log('Name must be a non-empty string.');
      throw new Error('Name must be a non-empty string.');
    }
    if (schedulers_.findIndex((elem) => { return elem.name === name; }) !==
        -1) {
      console.log(
          'A SchedulerManager instance named "' + name + '" already exists.');
      throw new Error(
          'A SchedulerManager instance named "' + name + '" already exists.');
    }
    schedulers_.push({
      name: name,
      schedulerManager: new SchedulerManager(name, inputFile),
    });
    console.log('SchedulerManager instance "' + name + '" created.');
    return schedulers_[schedulers_.findIndex(
                           (elem) => { return elem.name === name; })]
        .schedulerManager;
  }

  /**
   * Returns the specified [SchedulerManager]{@link scheduler/SchedulerManager}
   * object.
   *
   * @param {string} name - The name of the [SchedulerManager]{@link
   * scheduler/SchedulerManager} to retrieve.
   * @returns {scheduler/SchedulerManager} The specified SchedulerManager.
   * @throws {Error} The name provided was null or an empty string, or a
   * [SchedulerManager]{@link scheduler/SchedulerManager} with this name does
   * not exist.
   */
  getSchedulerManager(name) {
    if (name === '' || name === null) {
      console.log('Name must be a non-empty string.');
      throw new Error('Name must be a non-empty string.');
    }
    let index = schedulers_.findIndex((elem) => { return elem.name === name; });
    if (index === -1) {
      console.log(
          'A SchedulerManager instance named "' + name + '" does not exist.');
      throw new Error(
          'A SchedulerManager instance named "' + name + '" does not exist.');
    } else {
      console.log('SchedulerManager instance "' + name + '" found.');
      return schedulers_[index].schedulerManager;
    }
  }

  /**
   * Deletes the specified [SchedulerManager]{@link scheduler/SchedulerManager}
   * object.
   *
   * @param {string} name - The name of the [SchedulerManager]{@link
   * scheduler/SchedulerManager} to delete.
   * @throws {Error} The name provided was null or an empty string, or a
   * [SchedulerManager]{@link scheduler/SchedulerManager} with this name does
   * not exist.
   */
  deleteSchedulerManager(name) {
    if (name === '' || name === null) {
      console.log('Name must be a non-empty string.');
      throw new Error('Name must be a non-empty string.');
    }
    let index = schedulers_.findIndex((elem) => { return elem.name === name; });
    if (index === -1) {
      console.log(
          'A SchedulerManager instance named "' + name + '" does not exist.');
      throw new Error(
          'A SchedulerManager instance named "' + name + '" does not exist.');
    } else {
      schedulers_.splice(index, 1);
      console.log('SchedulerManager instance "' + name + '" deleted.');
    }
  }
}

module.exports.SchedulerFactory = SchedulerFactory;