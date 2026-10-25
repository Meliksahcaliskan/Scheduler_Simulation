// The invariant checker (PLAN.md §10.3): every preset passes, and each kind of broken schedule is caught.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, ALGORITHMS } from '../src/scheduler.js';
import { verifySchedule } from '../src/verify.js';
import { WORKLOADS } from '../src/workloads.js';
import { P } from './helpers.js';

const [BURST, ARRIVAL, OVERLAP, NONNEG, IDLE] = [0, 1, 2, 3, 4];

// Builds a result from hand-written segments, with metrics derived from those segments
// (so a test only breaks the invariant it targets, unless it says otherwise).
function fake(processes, segments) {
  const metrics = processes.map((p) => {
    const own = segments.filter((s) => s.pid === p.id);
    const firstStart = Math.min(...own.map((s) => s.start));
    const completion = Math.max(...own.map((s) => s.end));
    const turnaround = completion - p.arrival;
    return { pid: p.id, arrival: p.arrival, burst: p.burst, firstStart, completion, turnaround, waiting: turnaround - p.burst, response: firstStart - p.arrival };
  });
  return { segments, metrics };
}
const S = (pid, start, end) => ({ pid, start, end, sliceIndex: 0 });
const failing = (checks) => checks.map((c, i) => (c.pass ? null : i)).filter((i) => i !== null);

describe('every preset passes all five invariants', () => {
  for (const [key, w] of Object.entries(WORKLOADS)) {
    test(key, () => {
      for (const a of ALGORITHMS) {
        for (const q of a === 'RR' ? [1, 2, 4] : [null]) {
          const checks = verifySchedule(w.processes, simulate(w.processes, a, q));
          assert.equal(checks.length, 5);
          for (const c of checks) assert.ok(c.pass, `${key} ${a}${q ?? ''}: ${c.name}: ${c.detail}`);
        }
      }
    });
  }
});

describe('the checker catches broken schedules', () => {
  const two = P(['P1', 0, 2], ['P2', 1, 2]);

  test('a correct hand-written schedule passes', () => {
    assert.deepEqual(failing(verifySchedule(two, fake(two, [S('P1', 0, 2), S('P2', 2, 4)]))), []);
  });

  test('1: a process gets too little or too much CPU time', () => {
    assert.deepEqual(failing(verifySchedule(two, fake(two, [S('P1', 0, 2), S('P2', 2, 3)]))), [BURST]);
    const r = verifySchedule(two, fake(two, [S('P1', 0, 2), S('P2', 2, 5)]));
    assert.ok(failing(r).includes(BURST));
    assert.match(r[BURST].detail, /P2 received 3 of 2 units/);
  });

  test('1: a segment for an unknown process', () => {
    const r = fake(two, [S('P1', 0, 2), S('P2', 2, 4)]);
    r.segments.push(S('P9', 4, 5));
    assert.ok(failing(verifySchedule(two, r)).includes(BURST));
  });

  test('2: a process runs before its arrival (and its response time turns negative)', () => {
    const w = P(['P1', 0, 1], ['P2', 3, 2]);
    const r = verifySchedule(w, fake(w, [S('P1', 0, 1), S('P2', 1, 3)]));
    assert.deepEqual(failing(r), [ARRIVAL, NONNEG]);
    assert.match(r[ARRIVAL].detail, /P2 runs at t=1, before its arrival at t=3/);
  });

  test('3: overlapping segments', () => {
    assert.ok(failing(verifySchedule(two, fake(two, [S('P1', 0, 2), S('P2', 1, 3)]))).includes(OVERLAP));
  });

  test('3: a gap that is neither a process nor idle, and a timeline not starting at 0', () => {
    assert.ok(failing(verifySchedule(two, fake(two, [S('P1', 0, 2), S('P2', 3, 5)]))).includes(OVERLAP));
    const late = P(['P1', 2, 1]);
    assert.deepEqual(failing(verifySchedule(late, fake(late, [S('P1', 2, 3)]))), [OVERLAP]);
  });

  test('3: a zero-length segment', () => {
    assert.ok(failing(verifySchedule(two, fake(two, [S('P1', 0, 2), S(null, 2, 2), S('P2', 2, 4)]))).includes(OVERLAP));
  });

  test('4: the results table disagrees with the Gantt chart', () => {
    const r = fake(two, [S('P1', 0, 2), S('P2', 2, 4)]);
    r.metrics[1].waiting = 0;
    assert.deepEqual(failing(verifySchedule(two, r)), [NONNEG]);
  });

  test('5: the CPU idles while a process is ready', () => {
    const w = P(['P1', 0, 2]);
    const r = verifySchedule(w, fake(w, [S(null, 0, 1), S('P1', 1, 3)]));
    assert.deepEqual(failing(r), [IDLE]);
    assert.match(r[IDLE].detail, /CPU idle at t=0 while P1 is ready/);
  });

  test('5: idle before an arrival is fine', () => {
    const w = P(['P1', 2, 1]);
    assert.deepEqual(failing(verifySchedule(w, fake(w, [S(null, 0, 2), S('P1', 2, 3)]))), []);
  });
});
