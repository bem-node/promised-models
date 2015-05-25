/**
 * Promised models
 */

var EventEmitter = require('eventemitter3'),
    Vow = require('vow'),
    uniq = require('./uniq'),
    Inheritable = require('./inheritable'),

    /**
     * @class
     * @prop {object} [data] initial data
     */
    Model = Inheritable.inherit({
        __constructor: function (id, data) {
            var model = this,
                Storage = this.storage || Model.Storage;
            this.CHANGE_BRANCH = uniq();
            this.CALCULATIONS_BRANCH = uniq();
            if (arguments.length === 1) {
                if (typeof id === 'object') {
                    data = id;
                    id = null;
                }
            }
            this.id = id;
            data = data || {};
            this._eventEmitter = new EventEmitter();
            this._readyPromise = Vow.fulfill();
            this.storage = new Storage();
            this.fields = Object.keys(this.fields || {}).reduce(function (fields, name) {
                var Field = model.fields[name];
                fields[name] = new (Field.inherit({
                    name: name,
                    model: model
                }))(data[name]);
                return fields;
            }, {});
            this._fieldsAr = Object.keys(this.fields).map(function (name) {
                return model.fields[name];
            });
            this.commit(this.CHANGE_BRANCH);
            this.calculate().done();
        },

        /**
         * if model was synced with storage
         * @return {Boolean}
         */
        isNew: function () {
            return Boolean(this.id);
        },


        /**
         * save model changes
         * @return {Promise}
         */
        save: function () {
            var model = this;
            if (model.isNew()) {
                return model.ready().then(function () {
                    return model.storage.insert(model);
                }).then(function (id) {
                    model.id = id;
                    model.commit();
                });
            } else {
                return model.ready().then(function () {
                    return model.storage.update(model);
                }).then(function () {
                    model.commit();
                });
            }

        },

        /**
         * fetch model from storage
         * @return {Promise}
         */
        fetch: function () {
            var model = this;
            return Vow.fulfill().then(function () {
                return model.storage.find(model);
            }).then(function (data) {
                model.set(data);
                return model.ready();
            }).then(function () {
                model.commit();
            });
        },

        /**
         * remove model from storage and destruct it
         * @return {Promise}
         */
        remove: function () {
            var model = this;
            if (model.isNew()) {
                model.destruct();
                return Vow.fulfill();
            } else {
                return Vow.fulfill().then(function () {
                    return model.storage.remove(model);
                }).then(function () {
                    model.destruct();
                });
            }
        },

        /**
         * check of model destruted
         * @return {Boolean}
         */
        isDestructed: function () {
            return Boolean(this._isDestructed);
        },

        /**
         * destruct model instance
         */
        destruct: function () {
            this._isDestructed = true;
            this.trigger('destruct');
            this._eventEmitter.removeAllListeners();
        },


        /**
         * check if model is valid
         * @return {Promise<, {Model.ValidationError}>}
         */
        validate: function () {
            var model = this;
            return model.ready().then(function () {
                return Vow.all(model._fieldsAr.map(function (field) {
                    return field.validate();
                }));
            }).then(function (validateResults) {
                if (
                    //return 0 if any is false
                    Math.min.apply(Math, validateResults)
                ) {
                    return Vow.fulfill(true);
                } else {
                    return Vow.reject(validateResults.reduce(function (err, isValid, k) {
                        if (!isValid) {
                            err.fields.push(model._fieldsAr[k]);
                        }
                        return err;
                    }, new model.__self.ValidationError()));
                }
            });
        },

        /**
         * check if any field is changed
         * @prop {string} [branch=DEFAULT_BRANCH]
         * @return {Boolean}
         */
        isChanged: function (branch) {
            var model = this;
            return Object.keys(this.fields).some(function (name) {
                return model.fields[name].isChanged(branch);
            });
        },

        /**
         * revert all fields to initial or last commited value
         * @prop {string} [branch=DEFAULT_BRANCH]
         */
        revert: function (branch) {
            var model = this;
            return Object.keys(this.fields).forEach(function (name) {
                return model.fields[name].revert(branch);
            });
        },

        /**
         * commit current value, to not be rolled back
         * @prop {string} [branch=DEFAULT_BRANCH]
         */
        commit: function (branch) {
            var model = this;
            return Object.keys(this.fields).forEach(function (name) {
                return model.fields[name].commit(branch);
            });
        },

        /**
         * set field value
         * @param {string|object} name or data
         * @param {*} value
         * @return {Boolean} if field found
         */
        set: function (name, value) {
            var model = this,
                data;
            if (arguments.length === 1) {
                data = name;
                Object.keys(data).forEach(function (name) {
                    model.set(name, data[name]);
                });
            } else if (this.fields[name]) {
                this.fields[name].set(value);
            } else {
                return false;
            }
            return true;

        },

        /**
         * get field valie
         * @param  {string} fieldName
         * @return {*}
         */
        get: function (fieldName) {
            this._throwMissedField(fieldName);
            return this.fields[fieldName].get();
        },

        /**
         * return model data
         * @return {object}
         */
        toJSON: function () {
            var model = this;
            return Object.keys(this.fields).filter(function (name) {
                return !model.fields[name].internal;
            }).reduce(function (json, name) {
                var field = model.fields[name];
                json[name] = field.toJSON();
                return json;
            }, {});
        },

        /**
         * unbind events on fields or model
         * @param  {string}   [field] space separated list
         * @param  {string}   event space separated list
         * @param  {Function} cb
         * @param  {*}   [ctx]   [description]
         */
        un: function (field, event, cb, ctx) {
            this._callEventEmitter('removeListener', field, event, cb, ctx);
        },

        /**
         * bind events on fields or model
         * @param  {string}   [field] space separated list
         * @param  {string}   event space separated list
         * @param  {Function} cb
         * @param  {*}   [ctx]   [description]
         */
        on: function (field, event, cb, ctx) {
            this._callEventEmitter('on', field, event, cb, ctx);
        },

        /**
         * @see EventEmitter.emit
         */
        trigger: function () {
            this._eventEmitter.emit.apply(this._eventEmitter, arguments);
        },

        /**
         * if all calculations are done
         * @return {Boolean}
         */
        isReady: function () {
            return this._readyPromise.isResolved();
        },

        /**
         * wait for all calculations to be done
         * @return {Promise}
         */
        ready: function () {
            var model = this;
            return model._readyPromise.always(function (p) {
                //promise not changed
                if (model._readyPromise === p) {
                    return p;
                } else {
                    return model.ready();
                }
            });
        },

        /**
         * make all calculations for fields
         * @return {Promise}
         */
        calculate: function () {
            if (this.isReady()) {
                this.trigger('calculate');
                this._readyPromise = this._calculate();
            }
            return this._readyPromise;
        },

        _calculate: function () {
            var model = this,
                calculations = {},
                amendings = [],
                nestedCalculations = [];
            model.commit(model.CALCULATIONS_BRANCH);
            model._fieldsAr.forEach(function (field) {
                if (field.calculate) {
                    calculations[field.name] = field.calculate();
                }
                if (field.amend && field.isChanged(model.CHANGE_BRANCH)) {
                    amendings.push(field.amend());
                }
                if (field.ready) {
                    nestedCalculations.push(field.ready());
                }
            });
            return Vow.all([
                Vow.all(calculations),
                Vow.all(amendings),
                Vow.all(nestedCalculations)
            ]).spread(function (calculateData) {
                model.set(calculateData);
                if (model.isChanged(model.CALCULATIONS_BRANCH)) {
                    return model._calculate();
                } else {
                    model._triggerEvents();
                }
            });
        },

        _triggerEvents: function () {
            var model = this,
                changedFileds;
            if (model.isChanged(model.CHANGE_BRANCH)) {
                changedFileds = model._fieldsAr.filter(function (field) {
                    return field.isChanged(model.CHANGE_BRANCH);
                });
                model.commit(model.CHANGE_BRANCH);
                changedFileds.forEach(function (field) {
                    model._emitFieldChange(field);
                });
                model._emitChange();
            }
        },

        /**
         * bind events on fields or model
         * @param  {string}   method of EventEmitter
         * @param  {string}   [field] space separated list
         * @param  {string}   event space separated list
         * @param  {Function} cb
         * @param  {*}   [ctx]   [description]
         */
        _callEventEmitter: function (method, field, event, cb, ctx) {
            var model = this;
            if (typeof event !== 'string') {
                ctx = cb;
                cb = event;
                event = field;
                field = undefined;
            }
            ctx = ctx || this;
            if (field) {
                field.split(/\s+/).forEach(function (field) {
                    event.split(/\s+/).forEach(function (event) {
                        model._eventEmitter[method](event + ':' + field, cb, ctx);
                    });
                });
            } else {
                event.split(/\s+/).forEach(function (event) {
                    model._eventEmitter[method](event, cb, ctx);
                });
            }
        },

        /**
         * @param  {Model.Field} field
         */
        _emitFieldChange: function (field) {
            this.trigger('change:' + field.name);
        },

        _emitChange: function () {
            this.trigger('change');
        },

        _throwMissedField: function (fieldName) {
            if (!this.fields[fieldName]) {
                throw new Error('Unknown field ' + fieldName);
            }
        }

    }, {

        /**
         * @class
         * @abstract
         */
        Storage: require('./storage'),

        fields: {
            String: require('./fields/string'),
            Number: require('./fields/number'),
            Boolean: require('./fields/boolean'),
            List: require('./fields/list'),
            Model: require('./fields/model'),
            ModelsList: require('./fields/models-list')
        },

        /**
         * @type {Field}
         * @prop {*} [initValue]
         */
        Field: require('./field'),

        /**
         * @class <{Error}>
         * @prop {Array<{Field}>} fields
         */
        ValidationError: (function () {
            var ValidationError = function () {
                this.name = 'ValidationError';
                this.fields = [];
                Error.call(this); //super constructor
                Error.captureStackTrace(this, this.constructor);
            };
            ValidationError.prototype = new Error();
            ValidationError.prototype.constructor = ValidationError;
            return ValidationError;
        }())

    });

module.exports = Model;