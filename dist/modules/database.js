'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _mongodb = require('mongodb');

var _logger = require('./logger');

var _logger2 = _interopRequireDefault(_logger);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var _instance = null;

/**
 * @class
 */

var Database = function () {
  /**
   * Init or get a Database instance.
   * @constructor
   */
  function Database() {
    _classCallCheck(this, Database);

    if (!_instance) {
      this.start().then(function (database_instance) {
        _instance = database_instance;
        return _instance;
      }).catch(function (error) {
        throw error;
      });
    } else {
      return _instance;
    }
  }

  /**
   * Open new connection to MongoDB instance.
   */


  _createClass(Database, [{
    key: 'start',
    value: function start() {
      return new Promise(function (onSuccess, onError) {
        _logger2.default.info("connecting to mongodb://" + process.env.MONGO_BASE_URL + ":" + process.env.MONGO_PORT + "/" + process.env.MONGO_DB_NAME);
        _mongodb.MongoClient.connect("mongodb://" + process.env.MONGO_BASE_URL + ":" + process.env.MONGO_PORT + "/" + process.env.MONGO_DB_NAME).then(function (database) {
          _logger2.default.info("Connected to %s database at %s:%s", process.env.MONGO_DB_NAME, process.env.MONGO_BASE_URL, process.env.MONGO_PORT);
          onSuccess(database);
        }).catch(function (err) {
          _logger2.default.error(err);
          onError(err);
        });
      });
    }
  }, {
    key: 'stop',
    value: function stop() {
      if (_instance) {
        _logger2.default.info("Closing connection to %s database at %s:%s", process.env.MONGO_DB_NAME, process.env.MONGO_BASE_URL, process.env.MONGO_PORT);
        return _instance.close();
      } else {
        return null;
      }
    }

    /**
     * Run a find. Yield an array of documents.
     * @param query {object} - The query object
     * @param projection {object} - The projection object
     * @param collection {string} - The name of the target collection
     */

  }, {
    key: 'performFind',
    value: function performFind(query, projection, collection) {
      return _instance.collection(collection).find(query).project(projection);
    }

    /**
     * Update exactly one document matching the query with the update object.
     * @param filter_object {object} - The query object
     * @param update_object {object} - The replacement object
     * @param collection {string} - The name of target collection
     */

  }, {
    key: 'performUpdate',
    value: function performUpdate(filter_object, update_object, collection) {
      return _instance.collection(collection).updateOne(filter_object, update_object, { upsert: true });
    }

    /**
     * Perform a findOne and modify exactly one doc matching the query. Returns updated document.
     * @param filter_object {object} - The query object
     * @param update_object {object} - The replacement object
     * @param collection {string} - The name of target collection
     */

  }, {
    key: 'performFindOneAndModify',
    value: function performFindOneAndModify(filter_object, update_object, collection) {
      return _instance.collection(collection).findOneAndUpdate(filter_object, update_object, { returnOriginal: false });
    }

    /**
     * Insert a given document in the target collection.
     * @param document {object} - an object to insert in database
     * @param collection {string} - the target collection
     */

  }, {
    key: 'performInsertOne',
    value: function performInsertOne(document, collection) {
      return _instance.collection(collection).insertOne(document);
    }

    /**
     * Removes one document matching the filter_object.
     * @param filter_object {object} - The query object
     * @param collection {string} - the target collection
     */

  }, {
    key: 'performRemove',
    value: function performRemove(filter_object, collection) {
      return _instance.collection(collection).deleteOne(filter_object);
    }

    /**
     * Returns all the values of a given key.
     * @param distinct_key {string} - target key
     * @param collection {string} - target collection
     */

  }, {
    key: 'performDistinct',
    value: function performDistinct(distinct_key, collection) {
      return _instance.collection(collection).distinct(distinct_key, {});
    }

    /**
     * Drops a collection.
     * @param collection {string} - the target collection
     */

  }, {
    key: 'performDrop',
    value: function performDrop(collection) {
      return _instance.collection(collection).drop();
    }

    /**
     * Insert an array of documents in target collection
     * @param doc_array {Array} - array of documents to be inserted
     * @param collection {string} - target collection
     */

  }, {
    key: 'performInsertMany',
    value: function performInsertMany(doc_array, collection) {
      return _instance.collection(collection).insertMany(doc_array);
    }
  }]);

  return Database;
}();

exports.default = new Database();