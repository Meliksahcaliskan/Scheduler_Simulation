// Browser UI (PLAN.md §7, §8; UI-IMPROVEMENTS.md). Builds DOM nodes and sets text only; it never parses HTML strings.
import { MAX_PROCESSES, MAX_QUANTUM } from './limits.js';
import { formatAverage } from './format.js';
import { validateFields, toProcesses } from './validate.js';
import { ALGORITHMS, simulate } from './scheduler.js';
import { verifySchedule } from './verify.js';
import { WORKLOADS } from './workloads.js';

const ALGORITHM_NAMES = {
  FCFS: 'FCFS: First-Come, First-Served',
  SJF: 'SJF: Shortest Job First (non-preemptive)',
  SRTF: 'SRTF: Shortest Remaining Time First (preemptive)',
  RR: 'RR: Round Robin',
};
const ALGORITHM_SUBTITLES = { FCFS: 'arrival order', SJF: 'non-preemptive', SRTF: 'preemptive', RR: 'quantum' };
const READY_LABELS = {
  FCFS: 'Ready set, in selection order (arrival, then input row)',
  SJF: 'Ready set, in selection order (burst, then arrival, then input row)',
  SRTF: 'Ready set, in selection order (remaining, then arrival, then input row)',
  RR: 'Ready queue (FIFO, head on the left)',
};
const AVERAGE_KEYS = ['turnaround', 'waiting', 'response'];
const TABS = { results: 'results', step: 'stepper', compare: 'compare' }; // tab name → panel id
const AUTO_RUN_DELAY_MS = 200;
const view = { rows: [], algorithm: 'FCFS', tab: 'results', run: null, compare: null, step: 0, timer: null, autoTimer: null };

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
  for (const c of children.flat(Infinity)) {
    if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

// Golden-angle hues; lightness 72% keeps black text above 4.5:1 contrast for every hue.
function processColor(index) {
  return `hsl(${Math.round((index * 137.508) % 360)}, 80%, 72%)`;
}

function swatch(index) {
  const s = h('span', { class: 'swatch', 'aria-hidden': 'true' });
  s.style.setProperty('--c', processColor(index));
  return s;
}

// ---- Process editor ----

function renderEditor() {
  const body = byId('proc-table').tBodies[0];
  body.replaceChildren(...view.rows.map((r, i) => h('tr', {},
    h('td', {}, swatch(i), i + 1),
    h('td', {}, cellInput(r, i, 'id', `Row ${i + 1} process ID`)),
    h('td', {}, cellInput(r, i, 'arrival', `Row ${i + 1} arrival time`)),
    h('td', {}, cellInput(r, i, 'burst', `Row ${i + 1} CPU burst`)),
    h('td', {}, h('button', { type: 'button', class: 'del', title: `Remove row ${i + 1}`, onclick: () => removeRow(i) }, '✕')),
  )));
  if (view.rows.length === 0) {
    body.append(h('tr', {}, h('td', { colSpan: 5, class: 'empty' }, 'No processes. Add one or load a workload.')));
  }
  byId('btn-add').disabled = view.rows.length >= MAX_PROCESSES;
  byId('proc-count').textContent = `${view.rows.length} / ${MAX_PROCESSES}`;
}

function cellInput(row, index, field, label) {
  return h('input', {
    value: String(row[field]), class: field, 'aria-label': label, autocomplete: 'off',
    inputMode: field === 'id' ? 'text' : 'numeric', 'data-row': index + 1, 'data-field': field,
    oninput: (e) => { row[field] = e.target.value; byId('preset-note').hidden = true; inputsChanged(false); },
    onkeydown: (e) => {
      // Enter in the last row's burst adds a row (Ctrl/⌘ + Enter is Run, handled globally).
      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && field === 'burst' && index === view.rows.length - 1) addRow();
    },
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
  editorChanged();
  const inputs = byId('proc-table').tBodies[0].querySelectorAll('input.id');
  inputs[inputs.length - 1].focus();
}

function removeRow(i) {
  view.rows.splice(i, 1);
  editorChanged();
}

function editorChanged() {
  renderEditor();
  byId('preset-note').hidden = true;
  inputsChanged(true);
}

// Sets the editor, algorithm and quantum from a preset; the caller decides when to run.
function loadWorkload(key) {
  const w = WORKLOADS[key];
  view.rows = w.processes.map((p) => ({ id: p.id, arrival: String(p.arrival), burst: String(p.burst) }));
  if (w.algorithm) setAlgorithm(w.algorithm);
  byId('inp-quantum').value = String(w.quantum);
  renderEditor();
  const note = byId('preset-note');
  note.textContent = `Loaded ${w.title}. ${w.checks}${w.algorithm ? ` Suggested algorithm: ${w.algorithm}.` : ''}`;
  note.hidden = false;
}

function setAlgorithm(a) {
  view.algorithm = a;
  for (const b of byId('algo-seg').children) b.setAttribute('aria-pressed', String(b.dataset.algo === a));
  syncQuantum();
}

// The quantum matters for RR, and for the RR row of the comparison (so it stays editable there).
function syncQuantum() {
  const rr = view.algorithm === 'RR';
  byId('quantum-row').hidden = !rr && view.tab !== 'compare';
  byId('quantum-note').textContent = rr ? '' : 'used by the RR row of the comparison';
}

function stepQuantum(delta) {
  const input = byId('inp-quantum');
  const text = input.value.trim();
  const q = /^\d+$/.test(text) ? Number(text) + delta : 1;
  input.value = String(Math.max(1, Math.min(MAX_QUANTUM, q)));
  inputsChanged(true);
}

// Every edit lands here. Auto-run re-runs (debounced while typing); otherwise old results are marked stale.
function inputsChanged(immediate) {
  stopPlayback();
  clearTimeout(view.autoTimer);
  if (!byId('chk-auto').checked) {
    setStale('The inputs changed after this run. Press Run simulation (or Ctrl/⌘ + Enter) to update.');
  } else if (immediate) {
    run();
  } else {
    view.autoTimer = setTimeout(run, AUTO_RUN_DELAY_MS);
  }
}

function setStale(message) {
  const note = byId('stale-note');
  note.textContent = message;
  note.hidden = view.run === null;
  byId('output').classList.toggle('stale', view.run !== null);
}

function clearStale() {
  byId('stale-note').hidden = true;
  byId('output').classList.remove('stale');
}

function fieldInput(e) {
  if (e.field === 'quantum') return byId('inp-quantum');
  if (e.field === null) return null;
  return byId('proc-table').querySelector(`input[data-row="${e.row}"][data-field="${e.field}"]`);
}

function markInvalid(input, message) {
  input.classList.add('invalid');
  input.setAttribute('aria-invalid', 'true');
  input.title = input.title ? `${input.title}\n${message}` : message;
}

// errors: [{ row, field, message }] from validateFields. The list stays; each field is also marked in place.
function showErrors(errors) {
  for (const input of document.querySelectorAll('input.invalid')) {
    input.classList.remove('invalid');
    input.removeAttribute('aria-invalid');
    input.title = '';
  }
  const box = byId('errors');
  box.replaceChildren();
  box.hidden = errors.length === 0;
  if (errors.length === 0) return;
  for (const e of errors) {
    const input = fieldInput(e);
    if (input) markInvalid(input, e.message);
  }
  box.append(h('strong', {}, 'Please fix the following before running:'), h('ul', {}, errors.map((e) => {
    const input = fieldInput(e);
    return h('li', {}, input
      ? h('button', { type: 'button', class: 'link', title: 'Go to this field', onclick: () => { input.focus(); input.select(); } }, e.message)
      : e.message);
  })));
}

// ---- Running ----

function run() {
  clearTimeout(view.autoTimer);
  stopPlayback();
  const algorithm = view.algorithm;
  const quantumText = byId('inp-quantum').value;
  const errors = validateFields(view.rows, algorithm, quantumText);
  showErrors(errors);
  if (errors.length > 0) {
    setStale('The input has errors, so this is the last valid run. Fix the errors to update it.');
    return;
  }
  const processes = toProcesses(view.rows);
  const q = algorithm === 'RR' ? Number(quantumText.trim()) : null;
  let result;
  try {
    result = simulate(processes, algorithm, q);
  } catch (err) {
    showErrors([{ row: null, field: null, message: err.message }]);
    setStale('The simulator stopped with an error, so this is the last valid run.');
    return;
  }
  view.run = { processes, algorithm, quantum: q, result, checks: verifySchedule(processes, result) };
  view.compare = compareRows(processes, quantumText);
  view.step = 0;
  clearStale();
  byId('output-empty').hidden = true;
  byId('output').hidden = false;
  renderTab();
}

function compareRows(processes, quantumText) {
  // Same rule as validation, applied to the quantum alone (the RR row needs it even when RR is not selected).
  const quantumError = validateFields([], 'RR', quantumText).find((e) => e.field === 'quantum');
  if (quantumError && view.algorithm !== 'RR') markInvalid(byId('inp-quantum'), quantumError.message);
  return ALGORITHMS.map((a) => {
    if (a === 'RR' && quantumError) return { a, error: quantumError.message };
    const q = a === 'RR' ? Number(quantumText.trim()) : null;
    try {
      const result = simulate(processes, a, q);
      return { a, q, result, ok: verifySchedule(processes, result).every((c) => c.pass) };
    } catch (err) {
      return { a, error: err.message };
    }
  });
}

function setTab(tab, updateHash) {
  if (tab !== 'step') stopPlayback();
  view.tab = tab;
  for (const [name, panelId] of Object.entries(TABS)) {
    byId(`tab-${name}`).setAttribute('aria-selected', String(name === tab));
    byId(panelId).hidden = name !== tab;
  }
  syncQuantum();
  if (updateHash) {
    const params = new URLSearchParams(location.hash.slice(1));
    params.set('tab', tab);
    // Some browsers refuse URL rewrites on file://; the tab still works, it just isn't kept in the URL.
    try { history.replaceState(null, '', `#${params}`); } catch { /* ignore */ }
  }
  renderTab();
}

// Only the visible tab is drawn, so the Gantt can size itself to the real width.
function renderTab() {
  if (!view.run) return;
  if (view.tab === 'results') renderResults();
  else if (view.tab === 'step') renderStep();
  else renderCompare();
}

function runTitle() {
  const { algorithm, quantum } = view.run;
  return algorithm === 'RR' ? `${ALGORITHM_NAMES.RR}, quantum = ${quantum}` : ALGORITHM_NAMES[algorithm];
}

function renderResults() {
  const { processes, algorithm, result, checks } = view.run;
  byId('results-title').textContent = runTitle();
  renderGantt(byId('gantt'), result.segments, processes, Infinity, algorithm === 'RR');
  renderMetrics(byId('metrics-table'), result);
  byId('verify-list').replaceChildren(...checks.map((c) => h('li', { class: c.pass ? 'pass' : 'fail' },
    c.pass ? '✅ ' : '❌ ', c.name, c.pass ? null : h('div', { class: 'detail' }, c.detail))));
}

// upTo = Infinity draws the whole chart; a finite t reveals only [0, t) (stepper).
function renderGantt(container, segments, processes, upTo, showSlices) {
  const colorOf = new Map(processes.map((p, i) => [p.id, processColor(i)]));
  const end = segments.length > 0 ? segments[segments.length - 1].end : 0;
  const available = Math.max(300, (container.clientWidth || 900) - 32);
  const unit = Math.max(24, Math.min(60, Math.floor(available / Math.max(end, 1))));
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
    h('tbody', {}, result.metrics.map((m, i) => h('tr', {}, cols.map(([k]) => h('td', {}, k === 'pid' ? swatch(i) : null, m[k]))))),
    h('tfoot', {}, h('tr', {}, h('th', { colSpan: 5 }, 'Average'), AVERAGE_KEYS.map((k) => h('td', {}, formatAverage(result.averages[k]))))),
  );
}

function renderCompare() {
  const rows = view.compare;
  const valid = rows.filter((r) => r.result);
  // Every average has the same denominator (process count), so numerators compare directly.
  const best = Object.fromEntries(AVERAGE_KEYS.map((k) => [k, Math.min(...valid.map((r) => r.result.averages[k].num))]));
  byId('compare-table').replaceChildren(
    h('thead', {}, h('tr', {}, ['Algorithm', 'Avg turnaround', 'Avg waiting', 'Avg response', 'Invariants'].map((t) => h('th', {}, t)))),
    h('tbody', {}, rows.map((r) => h('tr', {},
      h('td', {}, r.a === 'RR' && r.result ? `RR (q = ${r.q})` : r.a),
      r.result
        ? [AVERAGE_KEYS.map((k) => h('td', { class: r.result.averages[k].num === best[k] ? 'best' : '' }, formatAverage(r.result.averages[k]))),
          h('td', {}, r.ok ? '✅ all pass' : '❌ failed')]
        : h('td', { colSpan: 4, class: 'row-error' }, `Not run: ${r.error}`)))),
  );
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

  byId('st-title').textContent = runTitle();
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
    h('tbody', {}, statusesAt(events, k, processes).map(({ p, status, remaining }) => h('tr', { class: `st-${status.replaceAll(' ', '-')}` },
      h('td', {}, swatch(indexOf.get(p.id)), p.id), h('td', {}, p.arrival), h('td', {}, p.burst), h('td', {}, remaining), h('td', {}, status)))),
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

// Demo/test links, e.g. index.html#load=T3&algo=SRTF&step=4 or #p=P1:0:3,P2:1:2&algo=RR&q=1&tab=compare.
// The page always runs on load; run=1 is still accepted. step= opens the stepper, compare=1 the comparison.
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
  if (ALGORITHMS.includes(params.get('algo'))) setAlgorithm(params.get('algo'));
  if (params.has('q')) byId('inp-quantum').value = params.get('q');
  const fallback = params.has('compare') ? 'compare' : params.has('step') ? 'step' : 'results';
  const tab = params.get('tab') in TABS ? params.get('tab') : fallback;
  view.tab = tab;
  run();
  setTab(tab, false);
  if (params.has('step')) goTo(Number(params.get('step')) - 1);
}

function initUi() {
  const seg = byId('algo-seg');
  for (const a of ALGORITHMS) {
    seg.append(h('button', {
      type: 'button', class: 'seg-btn', 'data-algo': a, title: ALGORITHM_NAMES[a], 'aria-pressed': 'false',
      onclick: () => { setAlgorithm(a); inputsChanged(true); },
    }, h('b', {}, a), h('small', {}, ALGORITHM_SUBTITLES[a])));
  }
  const testSelect = byId('sel-test');
  for (const [key, w] of Object.entries(WORKLOADS)) {
    if (key.startsWith('T')) testSelect.append(h('option', { value: key }, w.title));
  }
  const load = (key) => { loadWorkload(key); inputsChanged(true); };

  byId('btn-load-a').addEventListener('click', () => load('A'));
  byId('btn-load-b').addEventListener('click', () => load('B'));
  testSelect.addEventListener('change', () => {
    if (testSelect.value) load(testSelect.value);
    testSelect.value = '';
  });
  byId('btn-clear').addEventListener('click', () => {
    view.rows = [];
    editorChanged();
  });
  byId('btn-add').addEventListener('click', addRow);
  byId('inp-quantum').addEventListener('input', () => inputsChanged(false));
  byId('q-dec').addEventListener('click', () => stepQuantum(-1));
  byId('q-inc').addEventListener('click', () => stepQuantum(1));
  byId('chk-auto').addEventListener('change', (e) => { if (e.target.checked) run(); });
  byId('btn-run').addEventListener('click', run);
  for (const name of Object.keys(TABS)) byId(`tab-${name}`).addEventListener('click', () => setTab(name, true));

  byId('st-reset').addEventListener('click', () => goTo(0));
  byId('st-prev').addEventListener('click', () => goTo(view.step - 1));
  byId('st-next').addEventListener('click', () => goTo(view.step + 1));
  byId('st-finish').addEventListener('click', () => goTo(Infinity));
  byId('st-play').addEventListener('click', togglePlayback);
  byId('st-speed').addEventListener('change', () => {
    if (view.timer) { stopPlayback(); togglePlayback(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run();
      return;
    }
    if (!view.run || view.tab !== 'step' || e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight') goTo(view.step + 1);
    if (e.key === 'ArrowLeft') goTo(view.step - 1);
  });
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderTab, 150);
  });

  loadWorkload('A');
  byId('preset-note').hidden = true;
  setAlgorithm(view.algorithm);
  applyHash();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUi);
  else initUi();
}
