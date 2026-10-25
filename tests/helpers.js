// Shared test helpers (not a test file: the name does not match node --test's patterns).
import assert from 'node:assert/strict';

export const P = (...rows) => rows.map(([id, arrival, burst]) => ({ id, arrival, burst }));
export const segs = (r) => r.segments.map((s) => [s.pid, s.start, s.end]);

const CLOSERS = ['complete', 'preempt', 'quantum-expire', 'idle-end'];

// Rebuilds segments from events only (PLAN.md §5.1: events and segments must not drift).
export function replay(events) {
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
