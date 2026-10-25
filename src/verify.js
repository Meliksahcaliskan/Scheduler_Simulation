// The five correctness invariants (PLAN.md §10.3). They are computed from the Gantt
// segments and the process input only, so they do not trust the engine's bookkeeping.

function segLabel(s) {
  return `${s.pid === null ? 'idle' : s.pid} [${s.start},${s.end})`;
}

function summarize(problems) {
  if (problems.length <= 3) return problems.join('; ');
  return `${problems.slice(0, 3).join('; ')} (+${problems.length - 3} more)`;
}

/** Returns [{ name, pass, detail }], one entry per invariant, in a fixed order. */
export function verifySchedule(processes, result) {
  const { segments, metrics } = result;
  const byPid = new Map(processes.map((p) => [p.id, { p, segs: [] }]));
  const unknown = [];
  for (const s of segments) {
    if (s.pid === null) continue;
    const entry = byPid.get(s.pid);
    if (entry) entry.segs.push(s);
    else unknown.push(s);
  }
  const entries = [...byPid.values()];
  const completionOf = (segs) => Math.max(...segs.map((s) => s.end));
  const checks = [];
  const add = (name, problems) => checks.push({ name, pass: problems.length === 0, detail: summarize(problems) });

  // 1. Exact CPU burst.
  const burst = unknown.map((s) => `segment ${segLabel(s)} belongs to no input process`);
  for (const { p, segs } of entries) {
    const got = segs.reduce((n, s) => n + (s.end - s.start), 0);
    if (got !== p.burst) burst.push(`${p.id} received ${got} of ${p.burst} units`);
  }
  add('Every process receives exactly its CPU burst', burst);

  // 2. Never before arrival.
  const early = [];
  for (const { p, segs } of entries) {
    for (const s of segs) if (s.start < p.arrival) early.push(`${p.id} runs at t=${s.start}, before its arrival at t=${p.arrival}`);
  }
  add('No process runs before its arrival', early);

  // 3. One CPU: positive-length segments, in time order, contiguous from t=0, no overlap.
  const overlap = [];
  segments.forEach((s, i) => {
    if (!(s.end > s.start)) overlap.push(`segment ${segLabel(s)} has no positive length`);
    if (i === 0) {
      if (s.start !== 0) overlap.push(`the timeline starts at t=${s.start}, not t=0`);
      return;
    }
    const prev = segments[i - 1];
    if (s.start < prev.end) overlap.push(`${segLabel(prev)} overlaps ${segLabel(s)}`);
    else if (s.start > prev.end) overlap.push(`gap [${prev.end},${s.start}) is neither a process nor idle`);
  });
  add('Processes do not overlap on the single CPU', overlap);

  // 4. Nonnegative waiting/response, recomputed from the Gantt and compared with the reported metrics.
  const negative = [];
  const reported = new Map(metrics.map((m) => [m.pid, m]));
  for (const { p, segs } of entries) {
    if (segs.length === 0) {
      negative.push(`${p.id} never runs`);
      continue;
    }
    const firstStart = Math.min(...segs.map((s) => s.start));
    const completion = completionOf(segs);
    const waiting = completion - p.arrival - p.burst;
    const response = firstStart - p.arrival;
    if (waiting < 0) negative.push(`${p.id} has waiting time ${waiting}`);
    if (response < 0) negative.push(`${p.id} has response time ${response}`);
    const m = reported.get(p.id);
    if (!m || m.firstStart !== firstStart || m.completion !== completion || m.waiting !== waiting || m.response !== response) {
      negative.push(`${p.id}: the results table does not match the Gantt chart`);
    }
  }
  add('Waiting and response times are nonnegative', negative);

  // 5. Work-conserving: an idle interval may not overlap [arrival, completion) of any process.
  const idleWhileReady = [];
  for (const s of segments) {
    if (s.pid !== null) continue;
    for (const { p, segs } of entries) {
      if (segs.length === 0) continue;
      const from = Math.max(s.start, p.arrival);
      if (from < Math.min(s.end, completionOf(segs))) idleWhileReady.push(`CPU idle at t=${from} while ${p.id} is ready`);
    }
  }
  add('The CPU is never idle while a process is ready', idleWhileReady);

  return checks;
}
