'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { secureEqual } = require('../src/authentication_middleware');

test('constant-time comparator requires exact non-empty values', () => {
  assert.equal(secureEqual('0123456789abcdef', '0123456789abcdef'), true);
  assert.equal(secureEqual('', ''), false);
  assert.equal(secureEqual('0123456789abcdef', 'wrong'), false);
});
