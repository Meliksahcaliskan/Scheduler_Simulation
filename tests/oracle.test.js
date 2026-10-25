// Melik's hand calculations (tests/oracle/hand.json) vs the engine (PLAN.md §10.1).
// Missing file or unfilled entries are SKIPPED with a message, never passed.
// Claude Code never writes hand.json and never derives its values from the engine.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { simulate } from '../src/scheduler.js';
import { verifySchedule } from '../src/verify.js';
import { WORKLOADS } from '../src/workloads.js';

const HAND_PATH = new URL('./oracle/hand.json', import.meta.url);
function loadHand() {
  if (!existsSync(HAND_PATH)) return null;
  try {
    return JSON.parse(readFileSync(HAND_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`tests/oracle/hand.json is not valid JSON: ${err.message}`);
  }
}
const hand = loadHand();

const CASES = {
  'A-FCFS': ['A', 'FCFS', null], 'A-SJF': ['A', 'SJF', null], 'A-SRTF': ['A', 'SRTF', null], 'A-RR2': ['A', 'RR', 2],
  'B-FCFS': ['B', 'FCFS', null], 'B-SJF': ['B', 'SJF', null], 'B-SRTF': ['B', 'SRTF', null], 'B-RR2': ['B', 'RR', 2],
};
for (const k of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']) {
  const w = WORKLOADS[k];
  CASES[k] = [k, w.algorithm, w.algorithm === 'RR' ? w.quantum : null];
}
const METRIC_FIELDS = ['firstStart', 'completion', 'turnaround', 'waiting', 'response'];
const AVERAGE_FIELDS = ['turnaround', 'waiting', 'response'];

// "25/4" or an integer → [num, den]. Decimals are rejected so that 1/3 can't be rounded away.
function parseFraction(value, where) {
  if (Number.isInteger(value)) return [value, 1];
  const m = /^\s*(-?\d+)\s*(?:\/\s*(\d+)\s*)?$/.exec(String(value));
  assert.ok(m && m[2] !== '0', `${where}: write averages as fractions like "25/4" (got ${JSON.stringify(value)})`);
  return [Number(m[1]), m[2] === undefined ? 1 : Number(m[2])];
}
const sameValue = ([a, b], [c, d]) => a * d === b * c;

function missingReason(key) {
  if (hand === null) return 'tests/oracle/hand.json not found: copy hand.template.json to hand.json and fill it in (PLAN.md §10.1)';
  const e = hand[key];
  if (!e) return `${key} is not in hand.json yet`;
  const empty = ['segments', 'metrics', 'averages'].filter((f) => e[f] === null || e[f] === undefined);
  return empty.length > 0 ? `${key} in hand.json has unfilled fields: ${empty.join(', ')}` : null;
}

for (const [key, [wl, algorithm, quantum]] of Object.entries(CASES)) {
  const label = `${key} (${algorithm}${quantum ? ` q=${quantum}` : ''})`;
  const skip = missingReason(key);
  if (skip) {
    // Top-level test, not inside describe(): a suite around a skipped test is reported as passed.
    test(`${label}: hand calculation vs engine`, { skip }, () => {});
    continue;
  }
  describe(label, () => {
    const entry = hand[key];
    const processes = WORKLOADS[wl].processes;
    const handSegments = entry.segments.map(([pid, start, end]) => ({ pid: pid === 'idle' ? null : pid, start, end, sliceIndex: 0 }));

    test('hand calculation is self-consistent', () => {
      assert.equal(entry.algorithm, algorithm, `${key}: "algorithm" field`);
      assert.equal(entry.quantum ?? null, quantum, `${key}: "quantum" field`);
      assert.deepEqual(Object.keys(entry.metrics).sort(), processes.map((p) => p.id).sort(), `${key}: metrics must list exactly the workload's processes`);
      const handMetrics = processes.map((p) => {
        const m = entry.metrics[p.id];
        assert.ok(m, `${key}: no metrics for ${p.id}`);
        assert.equal(m.turnaround, m.completion - p.arrival, `${key} ${p.id}: TAT ≠ completion − arrival`);
        assert.equal(m.waiting, m.turnaround - p.burst, `${key} ${p.id}: WT ≠ TAT − burst`);
        assert.equal(m.response, m.firstStart - p.arrival, `${key} ${p.id}: RT ≠ first start − arrival`);
        return { pid: p.id, ...m };
      });
      for (const f of AVERAGE_FIELDS) {
        const sum = handMetrics.reduce((s, m) => s + m[f], 0);
        assert.ok(sameValue(parseFraction(entry.averages[f], `${key} average ${f}`), [sum, processes.length]),
          `${key}: average ${f} ${entry.averages[f]} ≠ ${sum}/${processes.length} (sum of your own column)`);
      }
      for (const c of verifySchedule(processes, { segments: handSegments, metrics: handMetrics })) {
        assert.ok(c.pass, `${key}: hand Gantt breaks "${c.name}": ${c.detail}`);
      }
    });

    test('engine matches the hand calculation', () => {
      const r = simulate(processes, algorithm, quantum);
      assert.deepEqual(r.segments.map((s) => [s.pid, s.start, s.end]), handSegments.map((s) => [s.pid, s.start, s.end]), `${key}: Gantt segments differ`);
      for (const m of r.metrics) {
        for (const f of METRIC_FIELDS) assert.equal(m[f], entry.metrics[m.pid][f], `${key} ${m.pid}: ${f} differs`);
      }
      for (const f of AVERAGE_FIELDS) {
        const { num, den } = r.averages[f];
        assert.ok(sameValue([num, den], parseFraction(entry.averages[f], `${key} average ${f}`)), `${key}: average ${f} differs`);
      }
    });
  });
}
