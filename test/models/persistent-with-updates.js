var Model = require('../../lib/model'),
    Vow = require('vow'),
    storage = [],
    prepareData;

prepareData = function (data) {
    data.a = data.a + '_';
    return data;
};

module.exports = Model.inherit({
    attributes: {
        id: Model.attributeTypes.Id,
        a: Model.attributeTypes.String.inherit({
            default: 'a-0'
        })
    },

    storage: Model.Storage.inherit({
        insert: function(model) {
            return Vow.fulfill().delay(0).then(function () {
                var data = model.toJSON();
                data.id = storage.length;
                storage.push(prepareData(data));
                return data;
            });
        },

        update: function(model) {
            return Vow.fulfill().delay(0).then(function () {
                var data = prepareData(model.toJSON());
                storage[model.getId()] = data;
                return data;
            });
        }
    })

});
