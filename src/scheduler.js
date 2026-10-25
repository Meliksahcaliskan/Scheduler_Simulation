// Pure CPU scheduling engine (PLAN.md §3). No DOM, no globals, deterministic.
// Discrete-time loop: at each integer t the steps run in a fixed order, so
// segments and events come from the same code path (PLAN.md §3.4, §5.1).

export const ALGORITHMS = ['FCFS', 'SJF', 'SRTF', 'RR'];

// Selection keys, smallest wins (PLAN.md §3). RR uses FIFO order instead.
const SELECTION_KEYS = {
  FCFS: [['arrival', (p) => p.arrival], ['input row', (p) => p.index]],
  SJF: [['burst', (p) => p.burst], ['arrival', (p) => p.arrival], ['input row', (p) => p.index]],
  SRTF: [['remaining', (p) => p.remaining], ['arrival', (p) => p.arrival], ['input row', (p) => p.index]],
};

function compareByKeys(keys, a, b) {
  for (const [, get] of keys) {
    const d = get(a) - get(b);
    if (d !== 0) return d;
  }
  return 0;
}

function minByKeys(keys, list) {
  return list.reduce((best, p) => (compareByKeys(keys, p, best) < 0 ? p : best));
}

// Names the key that decided between the chosen process and the runner-up.
function explainChoice(keys, chosen, others) {
  if (others.length === 0) return 'the only ready process';
  const runnerUp = minByKeys(keys, others);
  const tied = [];
  for (const [label, get] of keys) {
    if (get(chosen) !== get(runnerUp)) {
      if (tied.length === 0) {
        return `smallest ${label} (${get(chosen)}; next is ${runnerUp.id} with ${get(runnerUp)})`;
      }
      const which = label === 'input row' ? 'earlier input row' : `smaller ${label}`;
      return `tie on ${tied.join(' and ')} with ${runnerUp.id} → ${which} wins`;
    }
    tied.push(label);
  }
  return 'the only ready process';
}

/**
 * processes: [{ id, arrival, burst }] (already validated, integers).
 * Returns { segments, metrics, averages, events } as described in PLAN.md §5.1.
 * Event snapshots are taken after the event is applied; `running` is { pid, remaining } or null.
 */
export function simulate(processes, algorithm, quantum) {
  if (!ALGORITHMS.includes(algorithm)) throw new Error(`Unknown algorithm "${algorithm}".`);
  if (processes.length === 0) throw new Error('No processes to schedule.');
  const isRR = algorithm === 'RR';
  if (isRR && !(Number.isInteger(quantum) && quantum >= 1)) {
    throw new Error('Round robin needs an integer quantum ≥ 1.');
  }

  const procs = processes.map((p, index) => ({
    id: p.id, index, arrival: p.arrival, burst: p.burst,
    remaining: p.burst, firstStart: null, completion: null, slices: 0,
  }));
  const arrivalOrder = [...procs].sort((a, b) => a.arrival - b.arrival || a.index - b.index);
  const keys = SELECTION_KEYS[algorithm];

  const ready = []; // RR: FIFO queue (head = index 0). Others: unordered set, viewed sorted by key.
  const segments = [];
  const events = [];
  let t = 0;
  let nextArrival = 0;
  let done = 0;
  let running = null;
  let sliceUsed = 0;
  let segStart = 0;
  let idleStart = null;
  // A correct run always ends by (last arrival + total burst). Past that, fail instead of hanging the page.
  const horizon = arrivalOrder[arrivalOrder.length - 1].arrival + procs.reduce((s, p) => s + p.burst, 0);

  const readyView = () => (isRR ? ready : [...ready].sort((a, b) => compareByKeys(keys, a, b)));
  const emit = (type, pid, detail) => {
    events.push({
      t, type, pid, detail,
      ready: readyView().map((p) => ({ pid: p.id, remaining: p.remaining })),
      running: running ? { pid: running.id, remaining: running.remaining } : null,
    });
  };
  const closeSegment = () => {
    segments.push({ pid: running.id, start: segStart, end: t, sliceIndex: running.slices - 1 });
  };

  for (;;) {
    // 1. Completion of the process that ran during [t-1, t).
    if (running && running.remaining === 0) {
      closeSegment();
      const p = running;
      p.completion = t;
      done++;
      running = null;
      emit('complete', p.id, `t=${t}: ${p.id} completes (received its full burst of ${p.burst})`);
    }
    if (done === procs.length) break;
    if (t > horizon) throw new Error(`Internal error: simulation passed t=${horizon} without finishing.`);

    // 2. Arrivals at exactly t, in (arrival, index) order.
    const atBoundary = isRR && running !== null && sliceUsed === quantum;
    const arrived = [];
    while (nextArrival < arrivalOrder.length && arrivalOrder[nextArrival].arrival <= t) {
      const p = arrivalOrder[nextArrival++];
      ready.push(p);
      arrived.push(p);
      let detail;
      if (atBoundary) {
        detail = `t=${t}: ${p.id} arrives at the quantum boundary → enqueued before ${running.id} (RR rule)`;
      } else if (isRR) {
        detail = `t=${t}: ${p.id} arrives → joins the tail of the ready queue`;
      } else if (running && algorithm !== 'SRTF') {
        detail = `t=${t}: ${p.id} arrives (burst ${p.burst}) → ready; ${algorithm} is non-preemptive, ${running.id} keeps the CPU`;
      } else {
        detail = `t=${t}: ${p.id} arrives (burst ${p.burst}) → ready`;
      }
      emit('arrive', p.id, detail);
    }

    // 3. RR quantum expiry. Same-time arrivals were queued in step 2, so they go first.
    if (atBoundary) {
      closeSegment();
      const p = running;
      running = null;
      ready.push(p);
      const detail = ready.length === 1
        ? `t=${t}: ${p.id} used its quantum of ${quantum} (${p.remaining} left); no other process is ready → it continues in a new slice`
        : `t=${t}: ${p.id} used its quantum of ${quantum} (${p.remaining} left) → re-enqueued at the tail`
          + (arrived.length > 0 ? `, after the processes that arrived at t=${t}` : '');
      emit('quantum-expire', p.id, detail);
    }

    // 4. SRTF: decide at every arrival time whether to preempt (strictly shorter only).
    if (algorithm === 'SRTF' && running && arrived.length > 0) {
      const best = minByKeys(keys, ready);
      if (best.remaining < running.remaining) {
        closeSegment();
        const p = running;
        running = null;
        ready.push(p);
        emit('preempt', p.id,
          `t=${t}: ${best.id} (remaining ${best.remaining}) < ${p.id} (remaining ${p.remaining}) → ${p.id} is preempted (SRTF: strictly shorter)`);
      } else if (best.remaining === running.remaining) {
        emit('keep', running.id,
          `t=${t}: ${best.id} (remaining ${best.remaining}) ties ${running.id} (remaining ${running.remaining}) → ${running.id} keeps running (SRTF: equal remaining does not preempt)`);
      } else {
        emit('keep', running.id,
          `t=${t}: shortest ready ${best.id} (remaining ${best.remaining}) is not shorter than ${running.id} (remaining ${running.remaining}) → ${running.id} keeps running`);
      }
    }

    // 5. Dispatch if the CPU is free; otherwise start an idle interval.
    if (!running) {
      if (ready.length > 0) {
        if (idleStart !== null) {
          segments.push({ pid: null, start: idleStart, end: t, sliceIndex: null });
          idleStart = null;
          emit('idle-end', null, `t=${t}: idle interval ends`);
        }
        let p;
        let why;
        if (isRR) {
          p = ready.shift();
          why = 'head of the FIFO ready queue';
        } else {
          p = minByKeys(keys, ready);
          ready.splice(ready.indexOf(p), 1);
          why = explainChoice(keys, p, ready);
        }
        running = p;
        sliceUsed = 0;
        segStart = t;
        p.slices++;
        if (p.firstStart === null) p.firstStart = t;
        const slice = isRR ? ` (slice #${p.slices}, runs up to ${Math.min(quantum, p.remaining)})` : '';
        emit('dispatch', p.id, `t=${t}: ${p.id} dispatched: ${why}${slice}`);
      } else if (idleStart === null) {
        idleStart = t;
        emit('idle-start', null,
          `t=${t}: no process is ready → CPU idle until the next arrival at t=${arrivalOrder[nextArrival].arrival}`);
      }
    }

    // 6. Run one time unit.
    if (running) {
      running.remaining--;
      sliceUsed++;
    }
    t++;
  }

  const metrics = procs.map((p) => {
    const turnaround = p.completion - p.arrival;
    return {
      pid: p.id, arrival: p.arrival, burst: p.burst,
      firstStart: p.firstStart, completion: p.completion,
      turnaround, waiting: turnaround - p.burst, response: p.firstStart - p.arrival,
    };
  });
  const n = metrics.length;
  const total = (field) => metrics.reduce((s, m) => s + m[field], 0);
  const averages = {
    turnaround: { num: total('turnaround'), den: n },
    waiting: { num: total('waiting'), den: n },
    response: { num: total('response'), den: n },
  };

  return { segments, metrics, averages, events };
}
