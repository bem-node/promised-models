var expect = require('chai').expect,
    Model = require('../lib/model'),
    TestModel = Model.inherit({attributes: {
        id:  Model.attributeTypes.Id
    }});

describe('Id attribute', function () {

    describe('Id attribute declaration', function () {

        it('should set declared attribute as id attribute', function () {
            var ModelClass, model;

            ModelClass = Model.inherit({
                attributes: {
                    customId: Model.attributeTypes.Id
                }
            });

            model = new ModelClass({
                customId: 1
            });
            expect(model.getId()).to.equal(1);
        });

        it('should be able to change default id attribute type', function () {
            var ModelClass, model;

            ModelClass = Model.inherit({
                attributes: {
                    customId: Model.attributeTypes.Id.inherit({
                        dataType: String
                    })
                }
            });

            model = new ModelClass({
                customId: '1'
            });

            expect(model.getId()).to.equal('1');
        });

        it('Model#isNew should work correctly if id attribute not defined', function () {
            var model = new Model();
            expect(model.isNew()).to.be.true;
        });
    });

    describe('Id#isEqual', function () {
        it('should correctly check equality with null', function () {
            var model = new TestModel();
            expect(model.attributes.id.isEqual(null)).to.be.true;
        });

        it('should correctly check equality with non-null', function () {
            var model = new TestModel({
                id: 1
            });

            expect(model.attributes.id.isEqual(1)).to.be.true;
            expect(model.attributes.id.isEqual('1')).to.be.true;
        });

        it('should be able to unset', function () {
            var model = new TestModel({id: 1});
            model.unset('id');

            expect(model.getId()).is.to.be.null;
        });
    });

    describe('Legacy', function () {

        it('should change id property when id attribute has changed', function () {
            var model = new TestModel(1);
            model.set('id', 2);
            model.ready().then(function () {
                expect(model.id).to.equal(2);
            });

        });

    });


});
