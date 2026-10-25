import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAverage } from '../src/format.js';

test('averages show 2 decimals plus the exact unreduced fraction', () => {
  assert.equal(formatAverage({ num: 25, den: 4 }), '6.25 (25/4)');
  assert.equal(formatAverage({ num: 0, den: 4 }), '0.00 (0/4)');
  assert.equal(formatAverage({ num: 8, den: 4 }), '2.00 (8/4)');
  assert.equal(formatAverage({ num: 1, den: 3 }), '0.33 (1/3)');
  assert.equal(formatAverage({ num: 2, den: 3 }), '0.67 (2/3)');
  assert.equal(formatAverage({ num: 1, den: 8 }), '0.13 (1/8)'); // exact half rounds up
  assert.equal(formatAverage({ num: 299, den: 30 }), '9.97 (299/30)');
});
