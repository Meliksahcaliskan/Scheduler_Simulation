// Validation spec tests (PLAN.md §4, §9 validation cases).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, toProcesses } from '../src/validate.js';
import { MAX_PROCESSES, MAX_ARRIVAL, MAX_BURST, MAX_QUANTUM } from '../src/limits.js';

const row = (id, arrival, burst) => ({ id, arrival, burst });
const ok = [row('P1', '0', '3'), row('P2', '2', '1')];

test('valid input gives no errors, for every algorithm', () => {
  for (const a of ['FCFS', 'SJF', 'SRTF']) assert.deepEqual(validateInput(ok, a, ''), []);
  assert.deepEqual(validateInput(ok, 'RR', '2'), []);
  assert.deepEqual(validateInput([row(' P1 ', ' 007 ', '1')], 'FCFS'), []);
});

test('empty list', () => {
  assert.deepEqual(validateInput([], 'FCFS'), ['Add at least one process.']);
});

test('too many processes', () => {
  const rows = Array.from({ length: MAX_PROCESSES + 1 }, (_, i) => row(`P${i}`, '0', '1'));
  assert.deepEqual(validateInput(rows, 'FCFS'), [`Too many processes: ${MAX_PROCESSES + 1} (at most ${MAX_PROCESSES}).`]);
});

test('empty and too-long IDs', () => {
  assert.deepEqual(validateInput([row('P1', '0', '1'), row('  ', '0', '1')], 'FCFS'), ['Row 2: Process ID is empty.']);
  assert.match(validateInput([row('ABCDEFGHIJKLM', '0', '1')], 'FCFS')[0], /^Row 1: .*longer than 12 characters/);
});

test('duplicate IDs are case-insensitive and point at the first row', () => {
  const rows = [row('P1', '0', '1'), row('P2', '0', '1'), row('p1', '0', '1'), row('P1', '0', '1')];
  assert.deepEqual(validateInput(rows, 'FCFS'), [
    'Row 3: ID "p1" duplicates "P1" in row 1 (IDs are case-insensitive).',
    'Row 4: ID "P1" duplicates "P1" in row 1.',
  ]);
});

test('arrival must be a whole number ≥ 0: rejects 1.0, 1e2, -0, "", " ", abc, +3, 1.5, -1', () => {
  for (const bad of ['1.0', '1e2', '-0', '', ' ', 'abc', '+3', '1.5', '-1']) {
    assert.deepEqual(validateInput([row('P1', bad, '1')], 'FCFS'),
      [`Row 1: Arrival time must be a whole number ≥ 0 (got "${bad}").`], `arrival ${JSON.stringify(bad)}`);
  }
});

test('burst must be a whole number ≥ 1', () => {
  assert.deepEqual(validateInput([row('P1', '0', '0')], 'FCFS'), ['Row 1: CPU burst must be a whole number ≥ 1 (got "0").']);
  for (const bad of ['1.0', '-2', '', 'x']) assert.equal(validateInput([row('P1', '0', bad)], 'FCFS').length, 1, bad);
});

test('over-limit values', () => {
  assert.deepEqual(validateInput([row('P1', String(MAX_ARRIVAL + 1), '1')], 'FCFS'),
    [`Row 1: Arrival time must be at most ${MAX_ARRIVAL} (got "${MAX_ARRIVAL + 1}").`]);
  assert.deepEqual(validateInput([row('P1', '0', String(MAX_BURST + 1))], 'FCFS'),
    [`Row 1: CPU burst must be at most ${MAX_BURST} (got "${MAX_BURST + 1}").`]);
  assert.deepEqual(validateInput(ok, 'RR', String(MAX_QUANTUM + 1)),
    [`Time quantum must be at most ${MAX_QUANTUM} (got "${MAX_QUANTUM + 1}").`]);
  assert.equal(validateInput([row('P1', String(MAX_ARRIVAL), String(MAX_BURST))], 'FCFS').length, 0, 'limits are inclusive');
});

test('quantum is checked only for RR', () => {
  assert.deepEqual(validateInput(ok, 'RR', '0'), ['Time quantum must be a whole number ≥ 1 (got "0").']);
  assert.deepEqual(validateInput(ok, 'RR', '1.5'), ['Time quantum must be a whole number ≥ 1 (got "1.5").']);
  assert.deepEqual(validateInput(ok, 'FCFS', '0'), []);
});

test('all errors are reported at once, tied to row numbers', () => {
  const errors = validateInput([row('', '-1', '0'), row('P2', '1.5', '2')], 'RR', '0');
  assert.deepEqual(errors, [
    'Row 1: Process ID is empty.',
    'Row 1: Arrival time must be a whole number ≥ 0 (got "-1").',
    'Row 1: CPU burst must be a whole number ≥ 1 (got "0").',
    'Row 2: Arrival time must be a whole number ≥ 0 (got "1.5").',
    'Time quantum must be a whole number ≥ 1 (got "0").',
  ]);
});

test('unknown algorithm', () => {
  assert.deepEqual(validateInput(ok, 'LIFO'), ['Unknown algorithm "LIFO".']);
});

test('numeric (non-string) values from preset workloads are accepted', () => {
  assert.deepEqual(validateInput([row('P1', 0, 3)], 'RR', 2), []);
});

test('toProcesses trims IDs and converts numbers', () => {
  assert.deepEqual(toProcesses([row(' p1 ', ' 07', '3 ')]), [{ id: 'p1', arrival: 7, burst: 3 }]);
});
