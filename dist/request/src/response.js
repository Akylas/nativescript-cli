'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.KinveyResponse = exports.StatusCode = undefined;

var _get = function get(object, property, receiver) { if (object === null) object = Function.prototype; var desc = Object.getOwnPropertyDescriptor(object, property); if (desc === undefined) { var parent = Object.getPrototypeOf(object); if (parent === null) { return undefined; } else { return get(parent, property, receiver); } } else if ("value" in desc) { return desc.value; } else { var getter = desc.get; if (getter === undefined) { return undefined; } return getter.call(receiver); } };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _headers = require('./headers');

var _headers2 = _interopRequireDefault(_headers);

var _assign = require('lodash/assign');

var _assign2 = _interopRequireDefault(_assign);

var _errors = require('../../errors');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var StatusCode = {
  Ok: 200,
  Created: 201,
  Empty: 204,
  RedirectTemporarily: 301,
  RedirectPermanently: 302,
  NotModified: 304,
  ResumeIncomplete: 308,
  Unauthorized: 401,
  NotFound: 404,
  ServerError: 500
};
Object.freeze(StatusCode);
exports.StatusCode = StatusCode;

var Response = function () {
  function Response() {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    _classCallCheck(this, Response);

    options = (0, _assign2.default)({
      statusCode: StatusCode.Empty,
      headers: new _headers2.default(),
      data: null
    }, options);

    this.statusCode = options.statusCode;
    this.headers = options.headers;
    this.data = options.data;
  }

  _createClass(Response, [{
    key: 'isSuccess',
    value: function isSuccess() {
      return this.statusCode >= 200 && this.statusCode < 300 || this.statusCode === StatusCode.RedirectPermanently || this.statusCode === StatusCode.NotModified;
    }
  }, {
    key: 'headers',
    get: function get() {
      return this._headers;
    },
    set: function set(headers) {
      if (!(headers instanceof _headers2.default)) {
        headers = new _headers2.default(headers);
      }

      this._headers = headers;
    }
  }, {
    key: 'error',
    get: function get() {
      if (this.isSuccess()) {
        return null;
      }

      var data = this.data || {};
      var name = data.name || data.error;
      var message = data.message || data.description;
      var debug = data.debug;
      var code = this.statusCode;

      if (code === StatusCode.Unauthorized) {
        return new _errors.InsufficientCredentialsError(message, debug, code);
      } else if (code === StatusCode.NotFound) {
        return new _errors.NotFoundError(message, debug, code);
      } else if (code === StatusCode.ServerError) {
        return new _errors.ServerError(message, debug, code);
      }

      return new _errors.KinveyError(name, message, debug, code);
    }
  }]);

  return Response;
}();

exports.default = Response;

var KinveyResponse = exports.KinveyResponse = function (_Response) {
  _inherits(KinveyResponse, _Response);

  function KinveyResponse() {
    _classCallCheck(this, KinveyResponse);

    return _possibleConstructorReturn(this, (KinveyResponse.__proto__ || Object.getPrototypeOf(KinveyResponse)).apply(this, arguments));
  }

  _createClass(KinveyResponse, [{
    key: 'error',
    get: function get() {
      if (this.isSuccess()) {
        return null;
      }

      var data = this.data || {};
      var name = data.name || data.error;
      var message = data.message || data.description;
      var debug = data.debug;
      var code = this.statusCode;

      if (name === 'FeatureUnavailableError') {
        return new _errors.FeatureUnavailableError(message, debug, code);
      } else if (name === 'IncompleteRequestBodyError') {
        return new _errors.IncompleteRequestBodyError(message, debug, code);
      } else if (name === 'InsufficientCredentials') {
        return new _errors.InsufficientCredentialsError(message, debug, code);
      } else if (name === 'InvalidCredentials') {
        return new _errors.InvalidCredentialsError(message, debug, code);
      } else if (name === 'InvalidIdentifierError') {
        return new _errors.InvalidIdentifierError(message, debug, code);
      } else if (name === 'InvalidQuerySyntaxError') {
        return new _errors.InvalidQuerySyntaxError(message, debug, code);
      } else if (name === 'JSONParseError') {
        return new _errors.JSONParseError(message, debug, code);
      } else if (name === 'MissingQueryError') {
        return new _errors.MissingQueryError(message, debug, code);
      } else if (name === 'MissingRequestHeaderError') {
        return new _errors.MissingRequestHeaderError(message, debug, code);
      } else if (name === 'MissingRequestParameterError') {
        return new _errors.MissingRequestParameterError(message, debug, code);
      } else if (name === 'EntityNotFound' || name === 'CollectionNotFound' || name === 'AppNotFound' || name === 'UserNotFound' || name === 'BlobNotFound' || name === 'DocumentNotFound') {
        return new _errors.NotFoundError(message, debug, code);
      } else if (name === 'ParameterValueOutOfRangeError') {
        return new _errors.ParameterValueOutOfRangeError(message, debug, code);
      } else if (name === 'ServerError') {
        return new _errors.ServerError(message, debug, code);
      }

      return _get(KinveyResponse.prototype.__proto__ || Object.getPrototypeOf(KinveyResponse.prototype), 'error', this);
    }
  }]);

  return KinveyResponse;
}(Response);