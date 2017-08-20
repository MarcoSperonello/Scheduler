import {MongoClient as MongoClient} from 'mongodb';
import Logger from './logger'

let _instance = null;

/**
 * @class
 */
class Database {
  /**
   * Init or get a Database instance.
   * @constructor
   */
  constructor() {
    if (!_instance) {
      this.start()
        .then((database_instance) => {
          _instance = database_instance;
          return _instance
        })
        .catch((error) => {
          throw error
        });
    } else {
      return _instance
    }
  }

  /**
   * Open new connection to MongoDB instance.
   */
  start() {
    return new Promise((onSuccess, onError) => {
      Logger.info("connecting to mongodb://" + process.env.MONGO_BASE_URL + ":" + process.env.MONGO_PORT + "/" + process.env.MONGO_DB_NAME);
      MongoClient.connect("mongodb://" + process.env.MONGO_BASE_URL + ":" + process.env.MONGO_PORT + "/" + process.env.MONGO_DB_NAME)
        .then((database) => {
          Logger.info("Connected to %s database at %s:%s", process.env.MONGO_DB_NAME, process.env.MONGO_BASE_URL, process.env.MONGO_PORT);
          onSuccess(database)
        })
        .catch((err) => {
          Logger.error(err);
          onError(err)
        })
    })
  }

  stop() {
    if (_instance) {
      Logger.info("Closing connection to %s database at %s:%s", process.env.MONGO_DB_NAME, process.env.MONGO_BASE_URL, process.env.MONGO_PORT);
      return _instance.close()
    } else {
      return null
    }
  }

  /**
   * Run a find. Yield an array of documents.
   * @param query {object} - The query object
   * @param projection {object} - The projection object
   * @param collection {string} - The name of the target collection
   */
  performFind(query, projection, collection) {
    return _instance.collection(collection).find(query).project(projection);
  }

  /**
   * Update exactly one document matching the query with the update object.
   * @param filter_object {object} - The query object
   * @param update_object {object} - The replacement object
   * @param collection {string} - The name of target collection
   */
  performUpdate(filter_object, update_object, collection) {
    return _instance.collection(collection).updateOne(filter_object, update_object, {upsert: true});
  }


  /**
   * Perform a findOne and modify exactly one doc matching the query. Returns updated document.
   * @param filter_object {object} - The query object
   * @param update_object {object} - The replacement object
   * @param collection {string} - The name of target collection
   */
  performFindOneAndModify(filter_object, update_object, collection) {
    return _instance.collection(collection).findOneAndUpdate(filter_object, update_object, {returnOriginal: false});
  }

  /**
   * Insert a given document in the target collection.
   * @param document {object} - an object to insert in database
   * @param collection {string} - the target collection
   */
  performInsertOne(document, collection) {
    return _instance.collection(collection).insertOne(document);
  }

  /**
   * Removes one document matching the filter_object.
   * @param filter_object {object} - The query object
   * @param collection {string} - the target collection
   */
  performRemove(filter_object, collection) {
    return _instance.collection(collection).deleteOne(filter_object);
  }

  /**
   * Returns all the values of a given key.
   * @param distinct_key {string} - target key
   * @param collection {string} - target collection
   */
  performDistinct(distinct_key, collection) {
    return _instance.collection(collection).distinct(distinct_key, {});
  }

  /**
   * Drops a collection.
   * @param collection {string} - the target collection
   */
  performDrop(collection) {
    return _instance.collection(collection).drop();
  }

  /**
   * Insert an array of documents in target collection
   * @param doc_array {Array} - array of documents to be inserted
   * @param collection {string} - target collection
   */
  performInsertMany(doc_array, collection) {
    return _instance.collection(collection).insertMany(doc_array);
  }
}

export default new Database();