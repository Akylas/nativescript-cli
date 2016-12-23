import Query from 'src/query';
import expect from 'expect';

describe('Query', function() {

  describe('constructor', function(){
    it('should throw error when fields is not an array', function(){
      expect(() => {
        const query = new Query();
        query.fields = {};
        return query;
      }).toThrow(/fields must be an Array/);
    });

    it('should parse a limit from string', function() {
      const query = new Query();
      query.limit = '3';
      
      expect(query.limit).toEqual(3);
    });

    it('should parse a skip from string', function() {
      const query = new Query();
      query.skip = '10';
      
      expect(query.skip).toEqual(10);
    });

  });

  describe('isSupportedOffline()', function() {
    it('should be false when trying to filter geo queries', function() {
      const query = new Query();
      query.near('loc', [0, 0]);
      expect(query.isSupportedOffline()).toEqual(false);
    });

    it('should be true', function() {
      const query = new Query();
      query.equalTo('foo', 'bar');
      expect(query.isSupportedOffline()).toEqual(true);
    });
  });

  describe('process()', function() {
    it('throw an error when a query is not supported local', function() {
      expect(() => {
        const query = new Query();
        query.near('loc', [0, 0]);
        return query.process([]);
      }).toThrow(/This query is not able to run locally./);
    });
  });

  describe('comparators', function() {
    it('should add a $gt filter', function() {
      const query = new Query();
      query.greaterThan('field', 1);
      const queryString = query.toQueryString();
      expect(queryString).toInclude({ query: '{"field":{"$gt":1}}' });
    });

    it('throw an error when $gt comparator is not a string or number', function() {
      expect(() => {
        const query = new Query();
        query.greaterThan('field', {});
        return query.process([]);
      }).toThrow(/You must supply a number or string./);
    });

    it('should add a $gte filter', function() {
      const query = new Query();
      query.greaterThanOrEqualTo('field', 1);
      const queryString = query.toQueryString();
      expect(queryString).toInclude({ query: '{"field":{"$gte":1}}' });
    });

    it('throw an error when $gte comparator is not a string or number', function() {
      expect(() => {
        const query = new Query();
        query.greaterThanOrEqualTo('field', {});
        return query.process([]);
      }).toThrow(/You must supply a number or string./);
    });

    it('should add a $lt filter', function() {
      const query = new Query();
      query.lessThan('field', 1);
      const queryString = query.toQueryString();
      expect(queryString).toInclude({ query: '{"field":{"$lt":1}}' });
    });

    it('throw an error when $lt comparator is not a string or number', function() {
      expect(() => {
        const query = new Query();
        query.lessThan('field', {});
        return query.process([]);
      }).toThrow(/You must supply a number or string./);
    });

    it('should add a $lte filter', function() {
      const query = new Query();
      query.lessThanOrEqualTo('field', 1);
      const queryString = query.toQueryString();
      expect(queryString).toInclude({ query: '{"field":{"$lte":1}}' });
    });

    it('throw an error when $lte comparator is not a string or number', function() {
      expect(() => {
        const query = new Query();
        query.lessThanOrEqualTo('field', {});
        return query.process([]);
      }).toThrow(/You must supply a number or string./);
    });

    it('should add a $ne filter', function() {
      const query = new Query();
      query.notEqualTo('field', 1);
      const queryString = query.toQueryString();
      expect(queryString).toInclude({ query: '{"field":{"$ne":1}}' });
    });

  });

  describe('logical operators', function(){

    it('should add a $and filter', function() {
      const query1 = new Query();
      query1.equalTo('field1','value1');

      const query2 = new Query();
      query2.equalTo('field2', 'value2');

      const queryString = query1.and(query2).toQueryString();
      expect(queryString).toInclude({ query: '{"$and":[{"field1":"value1"},{"field2":"value2"}]}' });
    });

    it('should add a $or filter', function() {
      const query1 = new Query();
      query1.equalTo('field1','value1');

      const query2 = new Query();
      query2.equalTo('field2', 'value2');

      const queryString = query1.or(query2).toQueryString();
      expect(queryString).toInclude({ query: '{"$or":[{"field1":"value1"},{"field2":"value2"}]}' });
    });

    it('should add a $nor filter', function() {
      const query1 = new Query();
      query1.equalTo('field1','value1');

      const query2 = new Query();
      query2.equalTo('field2', 'value2');

      const queryString = query1.nor(query2).toQueryString();
      expect(queryString).toInclude({ query: '{"$nor":[{"field1":"value1"},{"field2":"value2"}]}' });
    });

  });

  describe('toQueryString()', function() {
    it('should have a query property', function() {
      const query = new Query();
      query.equalTo('name', 'tests');
      const queryString = query.toQueryString();
      expect(queryString).toInclude({ query: '{"name":"tests"}' });
    });

    it('should not have a query property', function () {
      const query = new Query();
      const queryString = query.toQueryString();
      expect(queryString).toExcludeKey('query');
    });

    it('should have a fields property', function () {
      const query = new Query();
      query.fields = ['foo', 'bar'];
      const queryString = query.toQueryString();
      expect(queryString).toInclude({ fields: 'foo,bar' });
    });

    it('should not have a fields property', function () {
      const query = new Query();
      const queryString = query.toQueryString();
      expect(queryString).toExcludeKey('fields');
    });

    it('should have a limit property', function () {
      const query = new Query();
      query.limit = 10;
      const queryString = query.toQueryString();
      expect(queryString).toInclude({ limit: 10 });
    });

    it('should not have a limit property', function () {
      const query = new Query();
      const queryString = query.toQueryString();
      expect(queryString).toExcludeKey('limit');
    });

    it('should have a skip property', function () {
      const query = new Query();
      query.skip = 10;
      const queryString = query.toQueryString();
      expect(queryString).toInclude({ skip: 10 });
    });

    it('should not have a skip property', function () {
      const query = new Query();
      query.skip = 0;
      const queryString = query.toQueryString();
      expect(queryString).toExcludeKey('skip');
    });

    it('should have a sort property', function () {
      const query = new Query();
      query.ascending('foo');
      const queryString = query.toQueryString();
      expect(queryString).toInclude({ sort: '{"foo":1}' });
    });

    it('should not have a sort property', function () {
      const query = new Query();
      const queryString = query.toQueryString();
      expect(queryString).toExcludeKey('sort');
    });
  });
});
