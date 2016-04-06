var Events = require('./events'),
    Collection,
    ARRAY_PROXY_METHODS = ['forEach', 'some', 'every', 'filter', 'map', 'reduce', 'indexOf'];

function clone(obj) {
    return Object.keys(obj).reduce(function (result, key) {
        result[key] = obj[key];
        return result;
    }, {});
}

/**
 * @class Collection
 * @extends Events
 */
Collection = Events.inherit(/** @lends Collection.prototype*/{

    /**
     * @type {Function}
     */
    modelType: null,

    DEFAULT_BRANCH: 'DEFAULT_BRANCH',

    PREVIOUS_BRANCH: 'PREVIOUS_BRANCH',

    /**
     * @param {Array.<(Model|Object)>} [data]
     * @param {Object} options
     */
    __constructor: function (data, options) {
        this.__base();

        options = options === undefined ? {} : options;

        if (options.modelType) {
            this.modelType = options.modelType;
        }

        /**
         * @type {Object.<String, Array.<Model>>}
         */
        this._cacheBranches = {};

        /**
         * @type {Array.<Model>}
         */
        this._models = [];

        /**
         * @type {Object.<string, Model>}
         */
        this._modelsIdsMap = {};

        this.set(data || []);
        this.commit();
    },

    destruct: function () {
        (this._models || []).forEach(function (model) {
            model.un('all', this._onModelEvent, this);
            if (model.isNested()) {
                model.destruct();
            }
        }, this);
        return this.__base.apply(this, arguments); 
    },

    /**
     * @param {String} [branch=DEFAULT_BRANCH]
     * @returns {Boolean}
     */
    isChanged: function (branch) {
        return this._models.some(function (model) {
            return model.isChanged(branch);
        }) || !this._isEqualToArray(this._getCacheBranch(branch));
    },

    /**
     * @param {String} [branch=DEFAULT_BRANCH]
     * @returns {Boolean}
     */
    commit: function (branch) {
        var changed = false;

        changed = this._models.reduce(function (changed,  model) {
            return model.commit(branch) || changed;
        }, false);

        branch = branch || this.DEFAULT_BRANCH;

        if (!this._isEqualToArray(this._getCacheBranch(branch))) {
            this._cacheBranches[branch] = [].concat(this._models);
            changed = true;
            if (branch === this.DEFAULT_BRANCH) {
                this.trigger('commit');
            }
        }

        return changed;
    },

    /**
     * @param {String} [branch=DEFAULT_BRANCH]
     * @returns {Collection}
     */
    revert: function (branch) {
        var cache;

        this._models.forEach(function (model) {
            model.revert(branch);
        });

        cache = this._getCacheBranch(branch);

        if (!this._isEqualToArray(cache)) {
            this.set(cache);
        }

        return this;
    },

    /**
     * @param {String} [branch=DEFAULT_BRANCH]
     * @returns {Array}
     */
    getLastCommited: function (branch) {
        return this._getCacheBranch(branch).map(function (model) {
            return model.getLastCommitted(branch);
        });
    },

    /**
     * @returns {Array}
     */
    previous: function () {
        return this.getLastCommited(this.PREVIOUS_BRANCH);
    },

    /**
     * @returns {Array.<Object>}
     */
    toJSON: function () {
        return this._models.map(function (model) {
            return model.toJSON();
        });
    },

    /**
     * @param {Number} index
     * @returns {?Model}
     */
    at: function (index) {
        return this._models[index] || null;
    },

    /**
     * @param {*} id
     * @returns {?Model}
     */
    get: function (id) {
        return this._modelsIdsMap[id] || null;
    },

    /**
     * @param {Function} fn
     * @param {Object} [ctx]
     * @returns {?Model}
     */
    find: function (fn, ctx) {
        var found = null;
        this.some(function (model, index, array) {
            var isFound;
            if (ctx) {
                isFound = fn.call(ctx, model, index, array);
            } else {
                isFound = fn(model, index, array);
            }
            if (isFound) {
                found = model;
                return true;
            }
        });
        return found;
    },

    /**
     * @param {Object} conditions
     * @returns {Array.<Model>}
     */
    where: function (conditions) {
        return this.filter(this._isMatchConditions.bind(this, conditions));
    },

    /**
     * @param {Object} conditions
     * @returns {?Model}
     */
    findWhere: function (conditions) {
        return this.find(this._isMatchConditions.bind(this, conditions));
    },

    /**
     * @param {String} attr
     * @returns {Array}
     */
    pluck: function (attr) {
        return this.map(function (model) {
            return model.get(attr);
        });
    },

    /**
     * @param {(Model|Object|Array.<(Model|Object)>)} models
     * @param {Object} [options]
     * @param {Number} [options.at]
     * @returns {Collection}
     */
    add: function (models, options) {
        var at = options && options.at;

        this.commit(this.PREVIOUS_BRANCH);

        models = Array.isArray(models) ? models : [models];
        models.forEach(function (model, index) {
            var currentOptions;
            model = this._prepareModel(model);
            if (!this._isExists(model) && !(!model.isNew() && this.get(model.getId()))) {
                if (at !== undefined) {
                    currentOptions = clone(options);
                    currentOptions.at = at + index;
                }
                this._addModel(model, currentOptions);
            }
        }, this);

        return this;
    },

    /**
     * @param {(Model|Array.<Model>)} models
     * @returns {Collection}
     */
    remove: function (models) {
        this.commit(this.PREVIOUS_BRANCH);

        models = Array.isArray(models) ? models : [models];
        models.forEach(function (model) {
            if (this._isExists(model)) {
                this._removeModel(model);
            }
        }, this);

        return this;
    },

    /**
     * @param {Array.<Model>} models
     * @returns {Collection}
     */
    set: function (models) {

        this.commit(this.PREVIOUS_BRANCH);

        this._models.forEach(function (model) {
            this._removeModelReference(model);
        }, this);

        this._models = models.map(function (data) {
            var model = this._prepareModel(data);
            this._addModelReference(model);
            return model;
        }, this);

        this.trigger('reset');


        return this;
    },

    /**
     * @param {String} [branch=DEFAULT_BRANCH]
     * @returns {Array.<Model>}
     */
    _getCacheBranch: function (branch) {
        branch = branch || this.DEFAULT_BRANCH;
        this._cacheBranches[branch] = this._cacheBranches[branch] || [];
        return this._cacheBranches[branch];
    },

    /**
     * @param {Array.<Model>} models
     * @returns {Boolean}
     */
    _isEqualToArray: function (models) {
        if (models.length === this.length) {
            return models.every(function (model, index) {
                return model === this.at(index);
            }, this);
        } else {
            return false;
        }
    },

    /**
     * @param {Object} conditions
     * @param {Model} model
     * @returns {Boolean}
     */
    _isMatchConditions: function (conditions, model) {
        return Object.keys(conditions).every(function (key) {
            return model.attributes[key].isEqual(conditions[key]);
        });
    },

    /**
     * @param {(Model|Object)} model
     * @returns {Model}
     */
    _prepareModel: function (model) {
        if (model instanceof this.modelType) {
            model.collection = model.collection || this;
            return model;
        } else {
            return new this.modelType(model, {
                collection: this,
                isNested: true
            });
        }
    },

    /**
     * @param {Model} model
     * @returns {Boolean}
     */
    _isExists: function (model) {
        return this.indexOf(model) !== -1;
    },

    /**
     * @param {Model} model
     * @param {Object} [options]
     */
    _addModel: function (model, options) {
        var at = options && typeof options.at !== 'undefined' ? options.at : this._models.length;

        this._models.splice(at, 0, model);
        this._addModelReference(model);

        this.trigger('add', model, {at: at});
    },

    /**
     * @param {Model} model
     */
    _removeModel: function (model) {
        var at = this._models.indexOf(model);

        this._removeModelReference(model);
        this._models.splice(at, 1);

        this.trigger('remove', model, {at: at});
    },

    /**
     * @param {Model} model
     */
    _addModelReference: function (model) {
        if (!model.isNew()) {
            this._modelsIdsMap[model.getId()] = model;
        }

        model.on('all', this._onModelEvent, this);
    },

    /**
     * @param {Model} model
     */
    _removeModelReference: function (model) {
        model.un('all', this._onModelEvent, this);

        if (model.collection === this) {
            delete model.collection;
        }

        if (!model.isNew()) {
            delete this._modelsIdsMap[model.getId()];
        }

        if (model.isNested()) {
            model.destruct();
        }
    },

    /**
     * @param {String} eventName
     * @param {Model} model
     */
    _onModelEvent: function (eventName, model) {
        if (eventName === 'destruct') {
            this._removeModel(model);
        }

        if (model.idAttribute && eventName === 'change:' + model.idAttribute.name) {
            if (model.idAttribute.previous() !== null) {
                delete this._modelsIdsMap[model.idAttribute.previous()];
            }
            if (!model.isNew()) {
                this._modelsIdsMap[model.getId()] = model;
            }
        }

        this.trigger.apply(this, arguments);
    }

});

ARRAY_PROXY_METHODS.forEach(function (methodName) {
    Collection.prototype[methodName] = function () {
        return this._models[methodName].apply(this._models, arguments);
    };
});

Object.defineProperty(Collection.prototype, 'length', {
    get: function () {
        return this._models.length;
    }
});


module.exports = Collection;
