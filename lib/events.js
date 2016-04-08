var EventEmitter = require('eventemitter3'),
    Inheritable = require('./inheritable'),
    Events, callEventEmitter;

/**
 * bind events on attributes or model
 * @param  {EventEmitter} eventEmitter
 * @param  {string}   method of EventEmitter
 * @param  {string}   [attribute] space separated list
 * @param  {string}   event space separated list
 * @param  {Function} cb
 * @param  {*}   [ctx]
 */
callEventEmitter = function (eventEmitter, method, attribute, event, cb, ctx) {
    if (typeof event !== 'string') {
        ctx = cb;
        cb = event;
        event = attribute;
        attribute = undefined;
    }
    ctx = ctx || this;
    if (attribute) {
        attribute.split(/\s+/).forEach(function (attribute) {
            event.split(/\s+/).forEach(function (event) {
                eventEmitter[method](event + ':' + attribute, cb, ctx);
            });
        });
    } else {
        event.split(/\s+/).forEach(function (event) {
            eventEmitter[method](event, cb, ctx);
        });
    }
};

/**
 * @class Events
 * @extends Inheritable
 */
Events = Inheritable.inherit(/** @lends Events.prototype */{

    __constructor: function () {
        this._eventEmitter = new EventEmitter();
    },

    /**
     * unbind events on attributes or model
     * @param  {string}   [attribute] space separated list
     * @param  {string}   event space separated list
     * @param  {Function} cb
     * @param  {*}   [ctx]
     * @returns {Events}
     */
    un: function (attribute, event, cb, ctx) {
        this._callEventEmitter('removeListener', attribute, event, cb, ctx);
        return this;
    },

    /**
     * bind events on attributes or model
     * @param  {string}   [attribute] space separated list
     * @param  {string}   event space separated list
     * @param  {Function} cb
     * @param  {*}   [ctx]
     * @returns {Events}
     */
    on: function (attribute, event, cb, ctx) {
        this._callEventEmitter('on', attribute, event, cb, ctx);
        return this;
    },

    /**
     * bind events on attributes or model. event handler will be colled only once
     * @param  {string}   [attribute] space separated list
     * @param  {string}   event space separated list
     * @param  {Function} cb
     * @param  {*}   [ctx]
     * @returns {Events}
     */
    once: function (attribute, event, cb, ctx) {
        this._callEventEmitter('once', attribute, event, cb, ctx);
        return this;
    },

    /**
     * @see EventEmitter.emit
     * @returns {Events}
     */
    trigger: function (event, a1, a2, a3) {
        var callEmitter = this.__self._eventEmitter;

        this._eventEmitter.emit.apply(this._eventEmitter, arguments);
        if (callEmitter) {
            callEmitter.emit.apply(callEmitter, arguments);
        }

        // trigger `all` event
        switch (arguments.length) {
            case 1: this._eventEmitter.emit('any', event); break;
            case 2: this._eventEmitter.emit('any', event, a1); break;
            case 3: this._eventEmitter.emit('any', event, a1, a2); break;
            case 4: this._eventEmitter.emit('any', event, a1, a2, a3); break;
        }

        return this;
    },

    /**
     * bind events on attributes or model
     * @param  {string}   method of EventEmitter
     * @param  {string}   [attribute] space separated list
     * @param  {string}   event space separated list
     * @param  {Function} cb
     * @param  {*}   [ctx]
     */
    _callEventEmitter: function (method, attribute, event, cb, ctx) {
        callEventEmitter(this._eventEmitter, method, attribute, event, cb, ctx);
    }

}, {
    /**
     * bind events for models of class
     * @param  {string} [attribute] space separated list
     * @param  {string} event space separated list
     * @param  {Function} cb
     * @param  {*} [ctx]
     * @returns {Function}
     */
    on: function (attribute, event, cb, ctx) {
        this._eventEmitter = this._eventEmitter || new EventEmitter();
        callEventEmitter(this._eventEmitter, 'on', attribute, event, cb, ctx);
        return this;
    },

    /**
     * unbind events from models of class
     * @param {string} [attribute] space separated list
     * @param {string} event space separated list
     * @param {Function} cb
     * @param {*} [ctx]
     * @returns {Function}
     */
    un: function (attribute, event, cb, ctx) {
        if (this._eventEmitter) {
            callEventEmitter(this._eventEmitter, 'removeListener', attribute, event, cb, ctx);
        }
        return this;
    }
});

module.exports = Events;
