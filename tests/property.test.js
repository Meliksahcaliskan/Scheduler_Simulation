// Randomized property test (PLAN.md §10.4). Seeded, so any failure is reproducible:
// the message names the workload number and prints its input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, ALGORITHMS } from '../src/scheduler.js';
import { verifySchedule } from '../src/verify.js';
import { segs, replay } from './helpers.js';

const SEED = 513;
const COUNT = 2000;
const QUANTA = [1, 2, 3, 4, 5];

// mulberry32: small, well-known 32-bit PRNG.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Small ranges on purpose, so ties, simultaneous arrivals and idle gaps are common.
// IDs are shuffled so that ID order and input order differ.
function randomWorkloads() {
  const rand = mulberry32(SEED);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const out = [];
  for (let k = 0; k < COUNT; k++) {
    const n = 1 + Math.floor(rand() * 8);
    const spread = pick([0, 3, 10, 30]);
    const maxBurst = pick([1, 3, 10]);
    const ids = Array.from({ length: n }, (_, i) => `P${i + 1}`).sort(() => rand() - 0.5);
    out.push(ids.map((id) => ({ id, arrival: Math.floor(rand() * (spread + 1)), burst: 1 + Math.floor(rand() * maxBurst) })));
  }
  return out;
}
const WORKLOADS_RANDOM = randomWorkloads();
const where = (k, w, label) => `workload #${k} (seed ${SEED}) ${label}: ${JSON.stringify(w)}`;

function runAll(w) {
  const runs = [];
  for (const a of ALGORITHMS) {
    for (const q of a === 'RR' ? QUANTA : [null]) runs.push({ label: a === 'RR' ? `RR q=${q}` : a, result: simulate(w, a, q) });
  }
  return runs;
}

test(`${COUNT} random workloads × all algorithms (RR q=1..5) pass all five invariants and event replay`, () => {
  WORKLOADS_RANDOM.forEach((w, k) => {
    for (const { label, result } of runAll(w)) {
      for (const c of verifySchedule(w, result)) assert.ok(c.pass, `${where(k, w, label)}: ${c.name}: ${c.detail}`);
      assert.deepEqual(replay(result.events), segs(result), `${where(k, w, label)}: event replay`);
    }
  });
});

test('SRTF has the lowest average waiting time of all algorithms', () => {
  WORKLOADS_RANDOM.forEach((w, k) => {
    const runs = runAll(w);
    const srtf = runs.find((r) => r.label === 'SRTF').result.averages.waiting.num;
    for (const { label, result } of runs) {
      assert.ok(srtf <= result.averages.waiting.num, `${where(k, w, label)}: SRTF total waiting ${srtf} > ${result.averages.waiting.num}`);
    }
  });
});

test('RR with a quantum ≥ the longest burst produces the FCFS schedule', () => {
  WORKLOADS_RANDOM.forEach((w, k) => {
    const q = Math.max(...w.map((p) => p.burst));
    assert.deepEqual(segs(simulate(w, 'RR', q)), segs(simulate(w, 'FCFS')), where(k, w, `RR q=${q}`));
  });
});

test('every algorithm finishes at the same time (all are work-conserving)', () => {
  WORKLOADS_RANDOM.forEach((w, k) => {
    const ends = runAll(w).map(({ result }) => result.segments.at(-1).end);
    assert.ok(ends.every((e) => e === ends[0]), `${where(k, w, '')}: end times ${ends}`);
  });
});

test('when all processes arrive together, SJF and SRTF produce the same schedule', () => {
  WORKLOADS_RANDOM.forEach((w, k) => {
    const same = w.map((p) => ({ ...p, arrival: w[0].arrival }));
    assert.deepEqual(segs(simulate(same, 'SRTF')), segs(simulate(same, 'SJF')), where(k, same, ''));
  });
});
