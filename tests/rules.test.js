// Spec-level rule tests (PLAN.md §9 T1–T7, §10.2). No Workload A/B here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, ALGORITHMS } from '../src/scheduler.js';

const P = (...rows) => rows.map(([id, arrival, burst]) => ({ id, arrival, burst }));
const segs = (r) => r.segments.map((s) => [s.pid, s.start, s.end]);
const EVENT_TYPES = ['arrive', 'dispatch', 'preempt', 'keep', 'quantum-expire', 'complete', 'idle-start', 'idle-end'];
const CLOSERS = ['complete', 'preempt', 'quantum-expire', 'idle-end'];

// Rebuilds segments from events only (PLAN.md §5.1: events and segments must not drift).
function replay(events) {
  const out = [];
  let open = null;
  for (const e of events) {
    if (e.type === 'dispatch' || e.type === 'idle-start') {
      assert.equal(open, null, `t=${e.t}: ${e.type} while a segment is open`);
      open = { pid: e.pid, start: e.t };
    } else if (CLOSERS.includes(e.type)) {
      assert.notEqual(open, null, `t=${e.t}: ${e.type} without an open segment`);
      assert.equal(e.pid, open.pid, `t=${e.t}: ${e.type} closes the wrong segment`);
      out.push([open.pid, open.start, e.t]);
      open = null;
    }
  }
  assert.equal(open, null, 'segment left open at the end');
  return out;
}

// Structural checks applied to every simulation in this file.
function run(processes, algorithm, quantum) {
  const r = simulate(processes, algorithm, quantum);
  let lastT = -1;
  for (const e of r.events) {
    assert.ok(EVENT_TYPES.includes(e.type), `unknown event type ${e.type}`);
    assert.ok(e.t >= lastT, 'events out of chronological order');
    assert.equal(typeof e.detail, 'string');
    lastT = e.t;
  }
  assert.deepEqual(replay(r.events), segs(r), 'event replay does not rebuild the segments');
  for (const m of r.metrics) {
    assert.equal(m.turnaround, m.completion - m.arrival);
    assert.equal(m.waiting, m.turnaround - m.burst);
    assert.equal(m.response, m.firstStart - m.arrival);
  }
  return r;
}

describe('T1–T7 (PLAN.md §9)', () => {
  test('T1 FCFS: idle at the start and in the middle', () => {
    const r = run(P(['P1', 3, 2], ['P2', 10, 1]), 'FCFS');
    assert.deepEqual(segs(r), [[null, 0, 3], ['P1', 3, 5], [null, 5, 10], ['P2', 10, 11]]);
    assert.deepEqual(r.averages.turnaround, { num: 3, den: 2 });
  });

  test('T2 SJF: simultaneous arrivals; equal bursts tie-break by input order', () => {
    const r = run(P(['P1', 0, 3], ['P2', 0, 3], ['P3', 0, 1]), 'SJF');
    assert.deepEqual(segs(r), [['P3', 0, 1], ['P1', 1, 4], ['P2', 4, 7]]);
    const d = r.events.find((e) => e.type === 'dispatch' && e.pid === 'P1');
    assert.match(d.detail, /tie on burst and arrival with P2 → earlier input row/);
  });

  test('T3 SRTF: a shorter arrival preempts the running process', () => {
    const r = run(P(['P1', 0, 6], ['P2', 2, 2]), 'SRTF');
    assert.deepEqual(segs(r), [['P1', 0, 2], ['P2', 2, 4], ['P1', 4, 8]]);
    assert.ok(r.events.some((e) => e.type === 'preempt' && e.pid === 'P1' && e.t === 2));
    assert.deepEqual(r.metrics.map((m) => [m.firstStart, m.completion, m.waiting, m.response]), [[0, 8, 2, 0], [2, 4, 0, 0]]);
  });

  test('T4 RR q=2: an arrival at the quantum boundary is enqueued before the preempted process', () => {
    const r = run(P(['P1', 0, 3], ['P2', 2, 2]), 'RR', 2);
    assert.deepEqual(segs(r), [['P1', 0, 2], ['P2', 2, 4], ['P1', 4, 5]]);
    const at2 = r.events.filter((e) => e.t === 2);
    assert.deepEqual(at2.map((e) => e.type), ['arrive', 'quantum-expire', 'dispatch']);
    assert.deepEqual(at2[1].ready.map((x) => x.pid), ['P2', 'P1']);
  });

  test('T5 SRTF: equal remaining time does not preempt', () => {
    const r = run(P(['P1', 0, 3], ['P2', 2, 1]), 'SRTF');
    assert.deepEqual(segs(r), [['P1', 0, 3], ['P2', 3, 4]]);
    const keep = r.events.find((e) => e.type === 'keep');
    assert.equal(keep.t, 2);
    assert.equal(keep.pid, 'P1');
    assert.match(keep.detail, /equal remaining does not preempt/);
    assert.ok(!r.events.some((e) => e.type === 'preempt'));
  });

  test('T6 RR q=2: finishing mid-quantum releases the CPU; a completed process never re-enters', () => {
    const r = run(P(['P1', 0, 1], ['P2', 0, 2]), 'RR', 2);
    assert.deepEqual(segs(r), [['P1', 0, 1], ['P2', 1, 3]]);
    assert.ok(!r.events.some((e) => e.type === 'quantum-expire' && e.pid === 'P1'));
    const doneAt = r.events.findIndex((e) => e.type === 'complete' && e.pid === 'P1');
    for (const e of r.events.slice(doneAt)) assert.ok(!e.ready.some((x) => x.pid === 'P1'));
  });

  test('T7 RR q=2: consecutive slices of one process stay separate segments', () => {
    const r = run(P(['P1', 0, 5]), 'RR', 2);
    assert.deepEqual(r.segments, [
      { pid: 'P1', start: 0, end: 2, sliceIndex: 0 },
      { pid: 'P1', start: 2, end: 4, sliceIndex: 1 },
      { pid: 'P1', start: 4, end: 5, sliceIndex: 2 },
    ]);
  });
});

describe('Edge cases (PLAN.md §10.2)', () => {
  test('idle gap before the first arrival, for every algorithm', () => {
    for (const a of ALGORITHMS) {
      const r = run(P(['P1', 5, 2]), a, 2);
      assert.deepEqual(segs(r), [[null, 0, 5], ['P1', 5, 7]], a);
    }
  });

  test('many simultaneous arrivals: FCFS uses input order, SJF uses burst then input order', () => {
    const w = P(['A', 0, 4], ['B', 0, 2], ['C', 0, 4], ['D', 0, 1], ['E', 0, 2]);
    assert.deepEqual(run(w, 'FCFS').segments.map((s) => s.pid), ['A', 'B', 'C', 'D', 'E']);
    assert.deepEqual(run(w, 'SJF').segments.map((s) => s.pid), ['D', 'B', 'E', 'A', 'C']);
  });

  test('single process', () => {
    for (const a of ['FCFS', 'SJF', 'SRTF']) assert.deepEqual(segs(run(P(['P1', 0, 3]), a)), [['P1', 0, 3]], a);
    assert.deepEqual(segs(run(P(['P1', 0, 3]), 'RR', 2)), [['P1', 0, 2], ['P1', 2, 3]]);
  });

  test('burst = 1 everywhere', () => {
    const w = P(['P1', 0, 1], ['P2', 0, 1], ['P3', 1, 1]);
    for (const a of ALGORITHMS) {
      assert.deepEqual(segs(run(w, a, 1)), [['P1', 0, 1], ['P2', 1, 2], ['P3', 2, 3]], a);
    }
  });

  test('RR with a quantum ≥ every burst equals FCFS', () => {
    const workloads = [
      P(['P1', 3, 2], ['P2', 10, 1]),
      P(['P1', 0, 6], ['P2', 2, 2], ['P3', 2, 5]),
      P(['X', 4, 7], ['Y', 0, 3], ['Z', 1, 1]),
    ];
    for (const w of workloads) assert.deepEqual(segs(run(w, 'RR', 100)), segs(run(w, 'FCFS')));
  });

  test('input order ≠ ID order: rows P3, P1, P2 arriving together', () => {
    const w = P(['P3', 0, 2], ['P1', 0, 2], ['P2', 0, 2]);
    for (const a of ['FCFS', 'SJF', 'SRTF']) assert.deepEqual(run(w, a).segments.map((s) => s.pid), ['P3', 'P1', 'P2'], a);
    assert.deepEqual(run(w, 'RR', 1).segments.map((s) => s.pid), ['P3', 'P1', 'P2', 'P3', 'P1', 'P2']);
  });

  test('SJF is non-preemptive: a shorter arrival waits', () => {
    assert.deepEqual(segs(run(P(['P1', 0, 5], ['P2', 1, 1]), 'SJF')), [['P1', 0, 5], ['P2', 5, 6]]);
  });

  test('SRTF: a preempted process is chosen later by remaining time, not queue order', () => {
    const r = run(P(['P1', 0, 10], ['P2', 1, 5], ['P3', 2, 1]), 'SRTF');
    assert.deepEqual(segs(r), [['P1', 0, 1], ['P2', 1, 2], ['P3', 2, 3], ['P2', 3, 7], ['P1', 7, 16]]);
  });

  test('SRTF: tie between two ready candidates on remaining → input order', () => {
    const r = run(P(['P1', 0, 4], ['P2', 1, 2], ['P3', 1, 2]), 'SRTF');
    assert.deepEqual(segs(r), [['P1', 0, 1], ['P2', 1, 3], ['P3', 3, 5], ['P1', 5, 8]]);
  });

  test('SRTF: a longer arrival is logged as a keep decision', () => {
    const r = run(P(['P1', 0, 2], ['P2', 1, 5]), 'SRTF');
    assert.deepEqual(segs(r), [['P1', 0, 2], ['P2', 2, 7]]);
    assert.ok(r.events.some((e) => e.type === 'keep' && e.t === 1 && e.pid === 'P1'));
  });

  test('RR: arrivals strictly inside a slice are queued ahead of the preempted process', () => {
    const r = run(P(['P1', 0, 4], ['P2', 1, 2]), 'RR', 3);
    assert.deepEqual(segs(r), [['P1', 0, 3], ['P2', 3, 5], ['P1', 5, 6]]);
  });

  test('RR: several arrivals at a boundary keep input order, all before the preempted process', () => {
    const r = run(P(['P1', 0, 3], ['P2', 2, 1], ['P3', 2, 1]), 'RR', 2);
    assert.deepEqual(segs(r), [['P1', 0, 2], ['P2', 2, 3], ['P3', 3, 4], ['P1', 4, 5]]);
  });

  test('RR: idle interval in the middle', () => {
    assert.deepEqual(segs(run(P(['P1', 0, 1], ['P2', 3, 1]), 'RR', 2)), [['P1', 0, 1], [null, 1, 3], ['P2', 3, 4]]);
  });

  test('non-RR schedules never contain two adjacent segments of the same process', () => {
    const w = P(['P1', 0, 6], ['P2', 2, 6], ['P3', 3, 1], ['P4', 3, 6]);
    for (const a of ['FCFS', 'SJF', 'SRTF']) {
      const s = run(w, a).segments;
      for (let i = 1; i < s.length; i++) assert.notEqual(s[i].pid, s[i - 1].pid, a);
    }
  });

  test('deterministic and does not mutate its input', () => {
    const w = P(['P1', 0, 6], ['P2', 2, 2]);
    const copy = structuredClone(w);
    for (const a of ALGORITHMS) {
      assert.deepEqual(simulate(w, a, 2), simulate(w, a, 2));
      assert.deepEqual(w, copy);
    }
  });

  test('rejects an unknown algorithm, an empty list and a bad RR quantum', () => {
    assert.throws(() => simulate(P(['P1', 0, 1]), 'LIFO'));
    assert.throws(() => simulate([], 'FCFS'));
    assert.throws(() => simulate(P(['P1', 0, 1]), 'RR', 0));
  });
});
