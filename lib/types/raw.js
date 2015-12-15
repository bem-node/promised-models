var Attribute = require('../attribute');
module.exports = Attribute.inherit({

    /**
     * @override {Attribute}
     */
    _toAttributeValue: function (value) {
        return value;
    },

    /**
     * @override {Attribute}
     */
    _fromAttributeValue: function (value) {
        return value;
    }

});
