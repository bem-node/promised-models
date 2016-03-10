/**
 * Promised models
 */

var Events = require('./events'),
    Vow = require('vow'),
    uniq = require('./uniq'),
    IdAttribute = require('./types/id'),
    Attribute = require('./attribute'),
    fulfill = require('./fulfill'),

    /**
     * @class Model
     * @extends Events
     */
    Model = Events.inherit(/** @lends Model.prototype */{

        /**
         * @deprecated use getId method
         */
        id: null,

        CALCULATIONS_BRANCH: 'CALCULATIONS_BRANCH',

        /**
         * @param {*} [id]
         * @param {Object} [data] initial data
         * @param {Object} [options]
         */
        __constructor: function (data, options) {
            var Storage, i, n, attrName, Attribute, modelAttrsDecl;

            this.__base();

            options = options === undefined ? {} : options;

            this.CHANGE_BRANCH = uniq();

            Storage = options.storage || this.storage;

            if (options.collection) {
                this.collection = options.collection;
            }

            this._isNested = Boolean(options.isNested);

            this._ready = true;
            this._readyPromise = fulfill();
            this.storage = Storage ? new Storage() : null;

            this._attributesNames = Object.keys(this.attributes || {});

            modelAttrsDecl = this.attributes;
            this.attributes = {};

            for (i = 0, n = this._attributesNames.length; i < n; i++) {
                attrName = this._attributesNames[i];
                Attribute = modelAttrsDecl[attrName];

                this.attributes[attrName] = new Attribute(attrName, this, (data || {})[attrName]);
                if (this.attributes[attrName] instanceof IdAttribute) {
                    this.idAttribute = this.attributes[attrName];
                }
            }

            this.commit(this.CHANGE_BRANCH);
            this.calculate();
        },

        /**
         * @returns {*}
         */
        getId: function () {
            return this.idAttribute ? this.idAttribute.get() : null;
        },

        /**
         * set attribute to default value
         * @param  {string} attributeName
         */
        unset: function (attributeName) {
            this._throwMissedAttribute(attributeName);
            this.attributes[attributeName].unset();
        },

        /**
         * check if attribute was set
         * @param  {string} attributeName
         * @return {Boolean}
         */
        isSet: function (attributeName) {
            this._throwMissedAttribute(attributeName);
            return this.attributes[attributeName].isSet();
        },

        /**
         * when false calculation errors will be silent
         * @type {Boolean}
         */
        throwCalculationErrors: true,

        /**
         * if model was synced with storage
         * @return {Boolean}
         */
        isNew: function () {
            return this.getId() === null;
        },

        /**
         * Returns true if model was created by another model or collection
         * @returns {Boolean}
         */
        isNested: function () {
            return this._isNested;
        },

        /**
         * save model changes
         * @return {Promise}
         */
        save: function () {
            var model = this;
            if (!model.idAttribute) {
                throw new Error('model without declared perisitent id attribute cat not be saved');
            }
            return this._rejectDestructed().then(function () {
                if (model.isNew()) {
                    return model.ready().then(function () {
                        return model.storage.insert(model);
                    }).then(function (id) {
                        model.idAttribute.set(id);
                        model.commit();
                        model.calculate();
                        return model.ready();
                    });
                } else {
                    return model.ready().then(function () {
                        return model.storage.update(model);
                    }).then(function () {
                        model.commit();
                    });
                }
            });
        },

        /**
         * fetch model from storage
         * @return {Promise}
         */
        fetch: function () {
            var model = this;
            if (!model.idAttribute) {
                throw new Error('model can not be fetched from persistent storage, if it has no persistent id');
            }
            return this.ready().then(function () {
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
                return fulfill();
            } else {
                if (!model.idAttribute) {
                    throw new Error('model can not be removed from persistet storage, if it has no persistent id');
                }
                return fulfill().then(function () {
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
            this.eachAttribute(function (attribute) {
                attribute.destruct();
            });
        },

        /**
         * @param {Function} cb
         * @param {Object} [ctx]
         */
        eachAttribute: function (cb, ctx) {
            this._attributesNames.forEach(function (attrName) {
                if (ctx) {
                    cb.call(ctx, this.attributes[attrName]);
                } else {
                    cb(this.attributes[attrName]);
                }
            }, this);
        },

        /**
         * check if model is valid
         * @return {Promise<Boolean, Model.ValidationError>}
         */
        validate: function () {
            var model = this;
            return model.ready().then(function () {
                return Vow.allResolved(model._attributesNames.map(function (attrName) {
                    return model.attributes[attrName].validate();
                }));
            }).then(function (validationPromises) {
                var errors = [],
                    error;

                validationPromises.forEach(function (validationPromise, index) {
                    var validationResult, error;

                    if (validationPromise.isFulfilled()) {
                        return;
                    }

                    validationResult = validationPromise.valueOf();

                    if (validationResult instanceof Error) {
                        error =  validationResult;
                    } else {
                        error = new Attribute.ValidationError();

                        if (typeof validationResult === 'string') {
                            error.message = validationResult;
                        } else if (typeof validationResult !== 'boolean') {
                            error.data = validationResult;
                        }
                    }

                    error.attribute = model.attributes[model._attributesNames[index]];

                    errors.push(error);
                });

                if (errors.length) {
                    error = new model.__self.ValidationError();
                    error.attributes = errors;
                    return Vow.reject(error);
                } else {
                    return fulfill(true);
                }
            });
        },

        /**
         * check if any attribute is changed
         * @prop {string} [branch=DEFAULT_BRANCH]
         * @return {Boolean}
         */
        isChanged: function (branch) {
            return this._attributesNames.some(function (attrName) {
                return this.attributes[attrName].isChanged(branch);
            }, this);
        },

        /**
         * revert all attributes to initial or last commited value
         * @prop {string} [branch=DEFAULT_BRANCH]
         */
        revert: function (branch) {
            this.eachAttribute(function (attr) {
                attr.revert(branch);
            });
        },

        /**
         * commit current value, to not be rolled back
         * @prop {string} [branch=DEFAULT_BRANCH]
         * @return {boolean}
         */
        commit: function (branch) {
            var eventString,
                changed = false;

            this.eachAttribute(function (attr) {
                changed = attr.commit(branch) || changed;
            });

            if (changed) {
                eventString = (branch ? branch + ':' : '') + 'commit';
                this.trigger(eventString);
            }

            return changed;
        },

        /**
         * @param {string} [branch=DEFAULT_BRANCH]
         * @returns {Object}
         */
        getLastCommitted: function (branch) {
            return this._getSerializedData('getLastCommitted', branch);
        },

        /**
         * @param {String} [attr] - if not defined returns all attributes
         * @returns {*}
         */
        previous: function (attr) {
            if (arguments.length) {
                return this.attributes[attr].previous();
            } else {
                return this._getSerializedData('previous');
            }
        },

        /**
         * set attribute value
         * @param {string|object} name or data
         * @param {*} value
         * @return {Boolean} if attribute found
         */
        set: function (name, value) {
            var data;

            if (arguments.length === 1) {
                data = name;
                this._attributesNames.forEach(function (name) {
                    if (data[name] !== undefined) {
                        this.set(name, data[name]);
                    }
                }, this);
            } else if (this.attributes[name]) {
                this.attributes[name].set(value);
            }

            return this;
        },

        /**
         * get attribute valie
         * @param  {string} attributeName
         * @return {*}
         */
        get: function (attributeName) {
            this._throwMissedAttribute(attributeName);
            return this.attributes[attributeName].get();
        },

        /**
         * return model data
         * @return {object}
         */
        toJSON: function () {
            return this._getSerializedData('toJSON');
        },

        /**
         * if all calculations are done
         * @return {Boolean}
         */
        isReady: function () {
            return this._ready;
        },

        /**
         * wait for all calculations to be done
         * @return {Promise}
         */
        ready: function () {
            return this._readyPromise;
        },

        /**
         * make all calculations for attributes
         * @return {Promise}
         */
        calculate: function () {
            var model = this;
            if (this.isReady()) {
                this._ready = false;
                this.trigger('calculate');
                //start _calculate on next tick
                this._readyPromise = fulfill().then(function () {
                    return model._calculate();
                });
                this._readyPromise.fail(function (e) {
                    console.error(e, e && e.stack);
                    model._ready = true;
                });
            } else {
                this._requireMoreCalculations = true;
            }
            if (this.throwCalculationErrors) {
                return this._readyPromise;
            } else {
                return this._readyPromise.always(function () {
                    return fulfill();
                });
            }

        },

        /**
         * @returns {Model}
         */
        trigger: function (event, a1, a2) {
            switch (arguments.length) {
                case 1: return this.__base(event, this);
                case 2: return this.__base(event, this, a1);
                case 3: return this.__base(event, this, a1, a2);
            }
        },

        /**
         * to prevent loop calculations we limit it
         * @type {Number}
         */
        maxCalculations: 100,

        /**
         * marker that requires one more calculation cycle
         * @type {Boolean}
         */
        _requireMoreCalculations: false,

        /**
         * @param  {Number} [n = 0] itteration
         * @return {Promise}
         */
        _calculate: function (n) {
            var model = this,
                calculations = {},
                hasCalculations = false,
                promises = [],
                amendings = [],
                nestedCalculations = [];

            n = n || 0;

            this._requireMoreCalculations = false;
            this._ready = false;

            if (n >= this.maxCalculations) {
                return this._throwCalculationLoop();
            }

            this._requireMoreCalculations = false;

            this.commit(this.CALCULATIONS_BRANCH);

            this.eachAttribute(function (attribute) {
                var calculationResult, amendResult, nestedResult;

                if (attribute.calculate) {
                    calculationResult = attribute.calculate();
                    calculations[attribute.name] = attribute.calculate();
                    hasCalculations = true;
                }

                if (attribute.amend && attribute.isChanged(model.CHANGE_BRANCH)) {
                    amendResult = attribute.amend();
                    if (Vow.isPromise(amendResult) && !amendResult.isResolved()) {
                        promises.push(amendResult);
                    }
                }

                if (attribute.ready) {
                    nestedResult = attribute.ready();
                    if (Vow.isPromise(nestedResult) && !nestedResult.isResolved()) {
                        promises.push(nestedResult);
                    }
                }
            });

            if (hasCalculations || promises.length) {
                return Vow.all([
                    Vow.all(calculations),
                    Vow.all(promises)
                ]).spread(this._onCalculateSuccess.bind(this, n));
            } else {
                return this._onCalculateSuccess(n);
            }
        },

        /**
         * @param {Number} n
         * @param {Object} [calculateData]
         * @returns {?Vow.Promise}
         */
        _onCalculateSuccess: function (n, calculateData) {
            if (!this._setCalculatedData(calculateData) || this._checkContinueCalculations()) {
                return this._calculate(++n);
            } else {
                this._triggerEvents();
                //some event habdler could change some attribute
                if (this._checkContinueCalculations()) {
                    return this._calculate(++n);
                }
            }
            this._ready = true;
        },

        /**
         * setting calculated data only if nothing have changed during calculations
         * otherwise we will have racing conditions(
         * @param {object} calculateData
         */
        _setCalculatedData: function (calculateData) {
            if (!this._checkContinueCalculations()) {
                calculateData && this.set(calculateData);
                return true;
            }
        },

        _checkContinueCalculations: function () {
            return this.isChanged(this.CALCULATIONS_BRANCH) || this._requireMoreCalculations;
        },

        /**
         * @return {Promise<, {Error}>} rejected promise
         */
        _throwCalculationLoop: function () {
            var changedFields = this._attributesNames.filter(function (attrName) {
                    return this.attributes[attrName].isChanged(this.CALCULATIONS_BRANCH);
                }, this);
            return Vow.reject(new Error(
                'After ' +
                this.maxCalculations +
                ' calculations fileds ' +
                changedFields +
                ' still changed'
            ));
        },

        _triggerEvents: function () {
            var changedFileds;

            if (this.isChanged(this.CHANGE_BRANCH)) {
                changedFileds = this._attributesNames.filter(function (attrName) {
                    return this.attributes[attrName].isChanged(this.CHANGE_BRANCH);
                }, this);
                this.commit(this.CHANGE_BRANCH);
                changedFileds.forEach(function (attrName) {
                    this._emitAttributeChange(this.attributes[attrName]);
                }, this);
                this._emitChange();
            }
        },

        /**
         * @param  {Model.Attribute} attribute
         */
        _emitAttributeChange: function (attribute) {
            this.trigger('change:' + attribute.name);
        },

        _emitChange: function () {
            this.trigger('change');
        },

        /**
         * @return {Promise}
         */
        _rejectDestructed: function () {
            if (this.isDestructed()) {
                return Vow.reject(new Error ('Model is destructed'));
            } else {
                return fulfill();
            }
        },

        _throwMissedAttribute: function (attributeName) {
            if (!this.attributes[attributeName]) {
                throw new Error('Unknown attribute ' + attributeName);
            }
        },

        /**
         * @param {('toJSON'|'getLastCommitted'|'previous')} serializeMethod
         * @param {...*} [args]
         * @returns {Object}
         */
        _getSerializedData: function (serializeMethod, a) {
            var data = {};

            this.eachAttribute(function (attribute) {
                if (!attribute.internal) {
                    data[attribute.name] = attribute[serializeMethod](a);
                }
            }, this);

            return data;
        }

    }, {

        /**
         * @override
         */
        inherit: function (props, staticProps) {
            staticProps = staticProps || {};
            staticProps.attributes = staticProps.attributes || props.attributes;
            staticProps.storage = staticProps.storage || props.storage;
            return this.__base(props, staticProps);
        },

        /**
         * @class
         * @abstract
         */
        Storage: require('./storage'),

        attributeTypes: {
            Id: IdAttribute,
            String: require('./types/string'),
            Number: require('./types/number'),
            Boolean: require('./types/boolean'),
            List: require('./types/list'),
            Model: require('./types/model'),
            ModelsList: require('./types/models-list'),
            Collection: require('./types/collection'),
            Object: require('./types/object'),
            Raw: require('./types/raw')
        },

        /**
         * @type {Attribute}
         * @prop {*} [initValue]
         */
        Attribute: require('./attribute'),

        Collection: require('./collection'),

        /**
         * @class <{Error}>
         * @prop {Array<{Attribute}>} attributes
         */
        ValidationError: (function () {
            var ValidationError = function () {
                this.name = 'ValidationError';
                this.attributes = [];
                Error.call(this); //super constructor
                if (Error.captureStackTrace) {
                    Error.captureStackTrace(this, this.constructor);
                } else {
                    this.stack = (new Error()).stack;
                }

            };
            ValidationError.prototype = Object.create(Error.prototype);
            ValidationError.prototype.constructor = ValidationError;
            return ValidationError;
        }())

    });

module.exports = Model;
