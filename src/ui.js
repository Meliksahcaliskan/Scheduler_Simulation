// Browser UI (PLAN.md §7, §8). Builds DOM nodes and sets text only; it never parses HTML strings.
import { MAX_PROCESSES } from './limits.js';
import { formatAverage } from './format.js';
import { validateInput, toProcesses } from './validate.js';
import { ALGORITHMS, simulate } from './scheduler.js';
import { verifySchedule } from './verify.js';
import { WORKLOADS } from './workloads.js';

const ALGORITHM_NAMES = {
  FCFS: 'FCFS: First-Come, First-Served',
  SJF: 'SJF: Shortest Job First (non-preemptive)',
  SRTF: 'SRTF: Shortest Remaining Time First (preemptive)',
  RR: 'RR: Round Robin',
};
const READY_LABELS = {
  FCFS: 'Ready set, in selection order (arrival, then input row)',
  SJF: 'Ready set, in selection order (burst, then arrival, then input row)',
  SRTF: 'Ready set, in selection order (remaining, then arrival, then input row)',
  RR: 'Ready queue (FIFO, head on the left)',
};
const AVERAGE_KEYS = ['turnaround', 'waiting', 'response'];
const view = { rows: [], run: null, step: 0, timer: null };

const byId = (id) => document.getElementById(id);

// Tiny DOM builder. Strings become text nodes, so user-typed IDs can never inject markup.
function h(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'style') Object.assign(node.style, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

function processColor(index) {
  return `hsl(${Math.round((index * 137.508) % 360)}, 70%, 80%)`;
}

// ---- Process editor ----

function renderEditor() {
  const body = byId('proc-table').tBodies[0];
  body.replaceChildren(...view.rows.map((r, i) => h('tr', {},
    h('td', {}, i + 1),
    h('td', {}, cellInput(r, 'id', `Row ${i + 1} process ID`)),
    h('td', {}, cellInput(r, 'arrival', `Row ${i + 1} arrival time`)),
    h('td', {}, cellInput(r, 'burst', `Row ${i + 1} CPU burst`)),
    h('td', {}, h('button', { type: 'button', class: 'del', title: `Remove row ${i + 1}`, onclick: () => removeRow(i) }, '✕')),
  )));
  if (view.rows.length === 0) {
    body.append(h('tr', {}, h('td', { colSpan: 5, class: 'empty' }, 'No processes. Add one or load a workload.')));
  }
  byId('btn-add').disabled = view.rows.length >= MAX_PROCESSES;
}

function cellInput(row, field, label) {
  return h('input', {
    value: String(row[field]), class: field, 'aria-label': label,
    inputMode: field === 'id' ? 'text' : 'numeric',
    oninput: (e) => { row[field] = e.target.value; markStale(); },
  });
}

function nextFreeId() {
  const used = new Set(view.rows.map((r) => String(r.id).trim().toLowerCase()));
  let k = 1;
  while (used.has(`p${k}`)) k++;
  return `P${k}`;
}

function addRow() {
  if (view.rows.length >= MAX_PROCESSES) return;
  view.rows.push({ id: nextFreeId(), arrival: '0', burst: '1' });
  renderEditor();
  markStale();
  const inputs = byId('proc-table').tBodies[0].querySelectorAll('input.id');
  inputs[inputs.length - 1].focus();
}

function removeRow(i) {
  view.rows.splice(i, 1);
  renderEditor();
  markStale();
}

function loadWorkload(key) {
  const w = WORKLOADS[key];
  view.rows = w.processes.map((p) => ({ id: p.id, arrival: String(p.arrival), burst: String(p.burst) }));
  if (w.algorithm) byId('sel-algo').value = w.algorithm;
  byId('inp-quantum').value = String(w.quantum);
  syncQuantum();
  renderEditor();
  markStale();
  const note = byId('preset-note');
  note.textContent = `Loaded ${w.title}. ${w.checks}${w.algorithm ? ` Suggested algorithm: ${w.algorithm}.` : ''}`;
  note.hidden = false;
}

function syncQuantum() {
  byId('inp-quantum').disabled = byId('sel-algo').value !== 'RR';
}

// Results no longer match the inputs: say so instead of silently showing old output.
function markStale() {
  stopPlayback();
  byId('preset-note').hidden = true;
  byId('compare').hidden = true;
  for (const n of document.querySelectorAll('.stale-note')) n.hidden = byId('results').hidden;
}

function showErrors(errors) {
  const box = byId('errors');
  box.replaceChildren();
  box.hidden = errors.length === 0;
  if (errors.length > 0) {
    box.append(h('strong', {}, 'Please fix the following before running:'), h('ul', {}, errors.map((e) => h('li', {}, e))));
  }
}

// ---- Running ----

function readInput(algorithm) {
  const quantumText = byId('inp-quantum').value;
  const errors = validateInput(view.rows, algorithm, quantumText);
  if (errors.length > 0) return { errors };
  return { errors, processes: toProcesses(view.rows), quantum: Number(String(quantumText).trim()) };
}

function run() {
  stopPlayback();
  const algorithm = byId('sel-algo').value;
  const { errors, processes, quantum } = readInput(algorithm);
  showErrors(errors);
  if (errors.length > 0) {
    for (const id of ['results', 'stepper', 'compare']) byId(id).hidden = true;
    view.run = null;
    return;
  }
  const q = algorithm === 'RR' ? quantum : null;
  let result;
  try {
    result = simulate(processes, algorithm, q);
  } catch (err) {
    showErrors([err.message]);
    return;
  }
  view.run = { processes, algorithm, quantum: q, result, checks: verifySchedule(processes, result) };
  byId('results').hidden = false;
  byId('stepper').hidden = false;
  for (const n of document.querySelectorAll('.stale-note')) n.hidden = true;
  renderResults();
  view.step = 0;
  renderStep();
}

function renderResults() {
  const { processes, algorithm, quantum, result, checks } = view.run;
  byId('results-title').textContent = algorithm === 'RR' ? `${ALGORITHM_NAMES.RR}, quantum = ${quantum}` : ALGORITHM_NAMES[algorithm];
  renderGantt(byId('gantt'), result.segments, processes, Infinity, algorithm === 'RR');
  renderMetrics(byId('metrics-table'), result);
  byId('verify-list').replaceChildren(...checks.map((c) => h('li', { class: c.pass ? 'pass' : 'fail' },
    c.pass ? '✅ ' : '❌ ', c.name, c.pass ? null : h('div', { class: 'detail' }, c.detail))));
}

// upTo = Infinity draws the whole chart; a finite t reveals only [0, t) (stepper).
function renderGantt(container, segments, processes, upTo, showSlices) {
  const colorOf = new Map(processes.map((p, i) => [p.id, processColor(i)]));
  const end = segments.length > 0 ? segments[segments.length - 1].end : 0;
  const unit = Math.max(24, Math.min(60, Math.floor(880 / Math.max(end, 1))));
  const chart = h('div', { class: 'gantt', style: { width: `${end * unit + 2}px` } });
  const ticks = new Set([0]);
  for (const s of segments) {
    if (s.start >= upTo) break;
    const shownEnd = Math.min(s.end, upTo);
    ticks.add(s.start);
    ticks.add(shownEnd);
    const idle = s.pid === null;
    const name = idle ? 'idle' : s.pid;
    const slice = showSlices && !idle ? `, slice #${s.sliceIndex + 1}` : '';
    const block = h('div', {
      class: `gantt-block${idle ? ' idle' : ''}${shownEnd < s.end ? ' partial' : ''}`,
      title: `${name}: [${s.start}, ${s.end}), ${s.end - s.start} unit(s)${slice}`,
      style: { left: `${s.start * unit}px`, width: `${(shownEnd - s.start) * unit}px` },
    }, h('span', {}, name), slice ? h('small', {}, `#${s.sliceIndex + 1}`) : null);
    if (!idle) block.style.setProperty('--c', colorOf.get(s.pid));
    chart.append(block);
  }
  for (const x of [...ticks].sort((a, b) => a - b)) {
    chart.append(h('div', { class: 'tick', style: { left: `${x * unit}px` } }, h('span', {}, x)));
  }
  if (Number.isFinite(upTo)) {
    chart.append(h('div', { class: 'gantt-cursor', title: `t = ${upTo}`, style: { left: `${Math.min(upTo, end) * unit}px` } }));
  }
  container.replaceChildren(chart);
}

function renderMetrics(table, result) {
  const cols = [['pid', 'Process'], ['arrival', 'Arrival'], ['burst', 'CPU burst'], ['firstStart', 'First start'],
    ['completion', 'Completion'], ['turnaround', 'Turnaround'], ['waiting', 'Waiting'], ['response', 'Response']];
  table.replaceChildren(
    h('thead', {}, h('tr', {}, cols.map(([, label]) => h('th', {}, label)))),
    h('tbody', {}, result.metrics.map((m) => h('tr', {}, cols.map(([k]) => h('td', {}, m[k]))))),
    h('tfoot', {}, h('tr', {}, h('th', { colSpan: 5 }, 'Average'), AVERAGE_KEYS.map((k) => h('td', {}, formatAverage(result.averages[k]))))),
  );
}

function compareAll() {
  stopPlayback();
  const { errors, processes, quantum } = readInput('RR');
  showErrors(errors);
  byId('compare').hidden = errors.length > 0;
  if (errors.length > 0) return;
  const rows = ALGORITHMS.map((a) => {
    const result = simulate(processes, a, a === 'RR' ? quantum : null);
    return { a, result, ok: verifySchedule(processes, result).every((c) => c.pass) };
  });
  // Every average has the same denominator (process count), so numerators compare directly.
  const best = Object.fromEntries(AVERAGE_KEYS.map((k) => [k, Math.min(...rows.map((r) => r.result.averages[k].num))]));
  byId('compare-table').replaceChildren(
    h('thead', {}, h('tr', {}, ['Algorithm', 'Avg turnaround', 'Avg waiting', 'Avg response', 'Invariants'].map((t) => h('th', {}, t)))),
    h('tbody', {}, rows.map(({ a, result, ok }) => h('tr', {},
      h('td', {}, a === 'RR' ? `RR (q = ${quantum})` : a),
      AVERAGE_KEYS.map((k) => h('td', { class: result.averages[k].num === best[k] ? 'best' : '' }, formatAverage(result.averages[k]))),
      h('td', {}, ok ? '✅ all pass' : '❌ failed')))),
  );
  byId('compare').scrollIntoView({ block: 'nearest' });
}

// ---- Stepper ----

function statusesAt(events, k, processes) {
  const arrived = new Set();
  const done = new Set();
  for (let i = 0; i <= k; i++) {
    if (events[i].type === 'arrive') arrived.add(events[i].pid);
    if (events[i].type === 'complete') done.add(events[i].pid);
  }
  const e = events[k];
  const inReady = new Map(e.ready.map((x) => [x.pid, x.remaining]));
  return processes.map((p) => {
    if (done.has(p.id)) return { p, status: 'done', remaining: 0 };
    if (e.running && e.running.pid === p.id) return { p, status: 'running', remaining: e.running.remaining };
    if (inReady.has(p.id)) return { p, status: 'ready', remaining: inReady.get(p.id) };
    // Same-instant arrivals are separate steps; don't call a process "not arrived" at its own arrival time.
    const status = arrived.has(p.id) ? 'waiting' : p.arrival === e.t ? 'arriving now' : 'not arrived';
    return { p, status, remaining: p.burst };
  });
}

function renderStep() {
  const { processes, algorithm, result } = view.run;
  const events = result.events;
  const k = view.step;
  const e = events[k];
  const last = events.length - 1;
  const indexOf = new Map(processes.map((p, i) => [p.id, i]));

  byId('st-counter').textContent = `Step ${k + 1} / ${events.length}`;
  byId('st-time').textContent = `t = ${e.t}`;
  byId('st-running').textContent = e.running ? `${e.running.pid} (remaining ${e.running.remaining})` : 'none';
  byId('st-ready-label').textContent = READY_LABELS[algorithm];
  const chips = e.ready.map((x) => {
    const p = processes[indexOf.get(x.pid)];
    const key = algorithm === 'FCFS' ? `arrival ${p.arrival}` : algorithm === 'SJF' ? `burst ${p.burst}` : `remaining ${x.remaining}`;
    const chip = h('span', { class: 'chip' }, `${x.pid} (${key})`);
    chip.style.setProperty('--c', processColor(indexOf.get(x.pid)));
    return chip;
  });
  byId('st-ready').replaceChildren(...(chips.length > 0 ? chips : [h('span', { class: 'muted' }, 'empty')]));
  byId('st-message').replaceChildren(h('span', { class: 'badge' }, e.type), e.detail);
  renderGantt(byId('st-gantt'), result.segments, processes, e.t, algorithm === 'RR');
  byId('st-remaining').replaceChildren(
    h('thead', {}, h('tr', {}, ['Process', 'Arrival', 'CPU burst', 'Remaining', 'Status'].map((t) => h('th', {}, t)))),
    h('tbody', {}, statusesAt(events, k, processes).map(({ p, status, remaining }) => h('tr', { class: `st-${status.replace(' ', '-')}` },
      h('td', {}, p.id), h('td', {}, p.arrival), h('td', {}, p.burst), h('td', {}, remaining), h('td', {}, status)))),
  );

  byId('st-reset').disabled = k === 0;
  byId('st-prev').disabled = k === 0;
  byId('st-next').disabled = k === last;
  byId('st-finish').disabled = k === last;
  byId('st-play').textContent = view.timer ? '⏸ Pause' : '▶ Play';
}

function goTo(k) {
  if (!view.run) return;
  stopPlayback();
  view.step = Math.max(0, Math.min(k, view.run.result.events.length - 1));
  renderStep();
}

function stopPlayback() {
  if (view.timer) clearInterval(view.timer);
  view.timer = null;
  const play = byId('st-play');
  if (play) play.textContent = '▶ Play';
}

function togglePlayback() {
  if (!view.run) return;
  if (view.timer) {
    stopPlayback();
    return;
  }
  const last = view.run.result.events.length - 1;
  if (view.step >= last) view.step = 0;
  view.timer = setInterval(() => {
    if (view.step >= last) stopPlayback();
    else view.step++;
    renderStep();
  }, Number(byId('st-speed').value));
  renderStep();
}

// ---- Setup ----

// Demo/test links, e.g. index.html#load=T3&algo=SRTF&run=1&step=4 or #p=P1:0:3,P2:1:2&algo=RR&q=1&run=1
function applyHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  if (WORKLOADS[params.get('load')]) loadWorkload(params.get('load'));
  if (params.has('p')) {
    view.rows = params.get('p').split(',').filter((s) => s !== '').map((s) => {
      const [id = '', arrival = '', burst = ''] = s.split(':');
      return { id, arrival, burst };
    });
    renderEditor();
  }
  if (ALGORITHMS.includes(params.get('algo'))) byId('sel-algo').value = params.get('algo');
  if (params.has('q')) byId('inp-quantum').value = params.get('q');
  syncQuantum();
  if (params.has('run')) {
    run();
    if (params.has('step')) goTo(Number(params.get('step')) - 1);
  }
  if (params.has('compare')) compareAll();
}

function initUi() {
  const algoSelect = byId('sel-algo');
  for (const a of ALGORITHMS) algoSelect.append(h('option', { value: a }, ALGORITHM_NAMES[a]));
  const testSelect = byId('sel-test');
  for (const [key, w] of Object.entries(WORKLOADS)) {
    if (key.startsWith('T')) testSelect.append(h('option', { value: key }, w.title));
  }

  byId('btn-load-a').addEventListener('click', () => loadWorkload('A'));
  byId('btn-load-b').addEventListener('click', () => loadWorkload('B'));
  testSelect.addEventListener('change', () => {
    if (testSelect.value) loadWorkload(testSelect.value);
    testSelect.value = '';
  });
  byId('btn-clear').addEventListener('click', () => {
    view.rows = [];
    renderEditor();
    markStale();
  });
  byId('btn-add').addEventListener('click', addRow);
  algoSelect.addEventListener('change', () => { syncQuantum(); markStale(); });
  byId('inp-quantum').addEventListener('input', markStale);
  byId('btn-run').addEventListener('click', run);
  byId('btn-compare').addEventListener('click', compareAll);

  byId('st-reset').addEventListener('click', () => goTo(0));
  byId('st-prev').addEventListener('click', () => goTo(view.step - 1));
  byId('st-next').addEventListener('click', () => goTo(view.step + 1));
  byId('st-finish').addEventListener('click', () => goTo(Infinity));
  byId('st-play').addEventListener('click', togglePlayback);
  byId('st-speed').addEventListener('change', () => {
    if (view.timer) { stopPlayback(); togglePlayback(); }
  });
  document.addEventListener('keydown', (e) => {
    if (!view.run || byId('stepper').hidden || e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight') goTo(view.step + 1);
    if (e.key === 'ArrowLeft') goTo(view.step - 1);
  });

  loadWorkload('A');
  byId('preset-note').hidden = true;
  applyHash();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUi);
  else initUi();
}
