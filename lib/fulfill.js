
var Vow = require('vow-with-domain');

/**
 * return fulfilled promise
 * @return {Promise}
 */
module.exports = function (value) {
    var p;
    if (Vow.Deferred) {
        return Vow.fulfill(value);
    } else {
        p = Vow.promise();
        p.fulfill(value);
        return p;
    }
};
