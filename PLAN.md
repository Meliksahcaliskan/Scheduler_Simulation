# CSE513 Assignment 1: CPU Scheduling Simulator (Plan v2)

> Deadline: **tonight**. Scope is ordered by grading weight. Anything marked *(optional)* is cut first.
> Time estimates are rough guesses, not commitments.

---

## 0. Locked decisions

| Topic | Decision |
|---|---|
| Hand calculations | **Melik does them by hand.** Claude Code never computes or fills oracle values (see §10.1). |
| Code style | ES modules in `src/`. A zero-dependency Node script bundles them into **one self-contained `index.html`** (inline JS + CSS). |
| Target machine | The instructor uses a **Mac**. The built `index.html` must work when double-clicked (`file://`) in Safari and Chrome, with no server, Python, or npm needed. |
| Node | v22.17.1 (Melik's machine). Tests use the built-in `node --test`. No `npm install`. |
| Hosting | Public GitHub repo + GitHub Pages. A username that shows Melik's name is fine. **No student number** anywhere. |
| Report | Generated **once at the end** as LaTeX, from `docs/dev-log.md` + generated data tables. Language: English. |
| Segment display | Merge consecutive same-process segments for FCFS/SJF/SRTF. **Never merge in RR.** |
| Process IDs | **Case-insensitive** uniqueness (`p1` and `P1` are duplicates). Display the ID as typed. |
| Input limits | Enabled, provisional, defined in one place (`src/limits.js`, §4). |
| Workflow | Phase by phase. Claude Code **stops at the end of each phase** and presents a checkpoint report (§13). |
| UI | Simple + **step-by-step playback mode** inspired by Melik's earlier array-algorithm visualizer (§8). |
| Averages | Shown with 2 decimals plus the exact fraction, e.g. `6.25 (25/4)`. |

---

## 1. Grading → effort

| Criterion | Weight | Where it is earned |
|---|---|---|
| Correctness & rule compliance | 50% | §3 spec, rule-level unit tests, oracle tests, property tests |
| Tests, hand calcs, verification | 20% | Melik's `hand.json`, own workloads T1–T7, 5 invariants, randomized test |
| Explanation & analysis | 20% | 6 answers backed by generated data, real bug story from the log |
| UI usability | 10% | Editor, Gantt, results, verification panel, stepper |

---

## 2. Scheduling model

- One CPU, one burst per process, no I/O, zero context-switch cost.
- Time is integer. Intervals are **half-open**: `[2,5)` = 3 units.
- The CPU is never idle while the ready set is non-empty. If nothing is ready, there is an explicit idle segment until the next arrival.
- A process is "ready" at time `t` if `arrival ≤ t` and it has not finished.

## 3. Algorithm spec (implementation must match exactly)

Every process has an `index` (its 0-based row position in the input). All tie-breaking uses explicit sort keys:

| Algorithm | Selection key (smallest wins) | When a decision happens |
|---|---|---|
| FCFS | `(arrival, index)` | Only when the CPU becomes free |
| SJF (non-preemptive) | `(burst, arrival, index)` | Only when the CPU becomes free |
| SRTF (preemptive) | `(remaining, arrival, index)` | When the CPU becomes free **and** at every arrival time |
| RR | FIFO queue order | At dispatch, completion, and quantum expiry |

### 3.1 SRTF details
- At any time `t` where processes arrive, compare each candidate to the running process. Preempt **only if** `candidate.remaining < running.remaining` (strict). On a tie, the running process continues.
- A preempted process goes back to the ready set. Later choices use the key above, not queue order.
- Every decision is logged as an event, including "kept running on equal remaining time". This makes the rule visible in the stepper.

### 3.2 RR details (pseudocode is normative)
```
admit(t): append every not-yet-admitted process with arrival ≤ t to the queue tail,
          ordered by (arrival, index)

t = 0
loop:
  admit(t)
  if queue empty:
      if all done: stop
      emit idle segment [t, nextArrival); t = nextArrival; continue
  p = queue.shift()
  run = min(q, p.remaining)
  emit segment [t, t+run) for p with sliceIndex = p.slicesSoFar++
  // arrivals strictly inside (t, t+run) join the tail in (arrival, index) order
  // arrivals exactly at t+run are admitted next, BEFORE p is re-enqueued
  t = t + run
  p.remaining -= run
  admit(t)
  if p.remaining == 0: p.completion = t     // never re-enqueued
  else: queue.push(p)                       // after same-time arrivals
```
- A process that finishes mid-quantum releases the CPU immediately.
- If `p` is the only ready process, it is re-dispatched immediately. That is a **new segment** with a new `sliceIndex`, and the Gantt shows the boundary.

### 3.3 Metrics
- Turnaround = completion − arrival
- Waiting = turnaround − burst
- Response = firstStart − arrival
- Averages = arithmetic mean over all processes, computed exactly as fractions. 2-decimal rounding happens only for display.

### 3.4 Implementation note
A discrete-time loop (t = 0, 1, 2, …) is acceptable and simpler to get right. The input limits keep the total timeline ≤ about 3,500 units. Event-driven code is also fine. The engine must emit the same segment/event structure either way.

## 4. Validation spec (`src/validate.js`)

Return an **array of human-readable errors**. An empty array means the input is valid. Show all errors at once, each tied to a row number.

| Field | Rule | Example message |
|---|---|---|
| ID | Trimmed, non-empty, 1–12 chars | `Row 3: Process ID is empty.` |
| ID | Unique, case-insensitive | `Row 3: ID "p1" duplicates "P1" in row 1 (IDs are case-insensitive).` |
| Arrival | Matches `/^\d+$/` after trim, ≤ `MAX_ARRIVAL` | `Row 2: Arrival time must be a whole number ≥ 0 (got "1.5").` |
| Burst | Integer, 1 ≤ burst ≤ `MAX_BURST` | `Row 4: CPU burst must be a whole number ≥ 1 (got "0").` |
| Quantum (RR only) | Integer, 1 ≤ q ≤ `MAX_QUANTUM` | `Time quantum must be a whole number ≥ 1.` |
| List | 1 ≤ count ≤ `MAX_PROCESSES` | `Add at least one process.` |

- Reject `"1.0"`, `"1e2"`, `"-0"`, `""`, `" "`, `"abc"`, `"+3"`.
- Provisional limits in `src/limits.js`: `MAX_PROCESSES = 30`, `MAX_ARRIVAL = 500`, `MAX_BURST = 100`, `MAX_QUANTUM = 100`.
- Output safety: render IDs with `textContent`, **never** `innerHTML`.

## 5. Architecture

```
src/
  limits.js         constants
  validate.js       input → errors[]
  scheduler.js      PURE engine: simulate(processes, algorithm, quantum) → result
  verify.js         5 invariants → [{name, pass, detail}]
  workloads.js      Workload A, B, T1–T7
  format.js         fraction/decimal formatting
  ui.js             DOM: editor, run, Gantt, results, verification, stepper
  index.template.html, style.css
scripts/
  build.mjs         bundles src/ → ./index.html (single file)
  report-data.mjs   (Phase 5) engine runs → report/generated/*.tex
tests/
  rules.test.js     spec-level edge cases (§10.2)
  validate.test.js
  oracle.test.js    hand.json vs engine (Workloads A, B)
  invariants.test.js, property.test.js, build.test.js
  oracle/hand.json  ← filled by Melik only
docs/
  dev-log.md        running log (§11)
report/             (Phase 5) main.tex + generated/
index.html          BUILT artifact, committed (served by Pages, runnable on Mac)
README.md, CLAUDE.md
```

### 5.1 Engine result shape
```js
{
  segments: [{ pid: "P1" | null /*idle*/, start, end, sliceIndex }],
  metrics:  [{ pid, arrival, burst, firstStart, completion, turnaround, waiting, response }], // input order
  averages: { turnaround: {num, den}, waiting: {num, den}, response: {num, den} },
  events:   [{ t, type, pid, detail, ready: [/* snapshot: pid + remaining, in queue/key order */], running }]
}
```
- `type` ∈ `arrive | dispatch | preempt | keep | quantum-expire | complete | idle-start | idle-end`.
- `detail` is a one-line English explanation that names the rule, e.g. `"t=2: P3 arrives at the quantum boundary → enqueued before P1 (RR rule)"`.
- Events come from **the same loop** that produces segments. There is no second implementation that could drift. A test checks that replaying events rebuilds the segments.

## 6. Build & run (Mac-proof)

- `node scripts/build.mjs` reads `index.template.html` and inlines `style.css`. It then concatenates the modules in a fixed order (`limits, format, validate, scheduler, verify, workloads, ui`) inside one classic `<script>` IIFE.
- To keep the bundler trivial and safe, modules follow these rules:
  - only `import { a, b } from './x.js';` on a single line
  - only `export function` / `export const`
  - no `export default`, no re-exports, no dynamic import
  - top-level names unique across modules
  - The bundler **fails loudly** if it sees anything else.
- `ui.js` starts on `DOMContentLoaded`, so the engine part can be loaded in Node for `build.test.js`.
- Run locally: double-click `index.html`, or run `open index.html` on macOS. No server needed. *(Verify on Safari; see §12.)*
- Dev loop: edit `src/` → `node scripts/build.mjs` → refresh the browser. `node --test` runs the engine tests directly on the ES modules.

## 7. UI (`ui.js`)

1. **Process editor**: table with ID / Arrival / Burst, add row, delete row, inline edit. Buttons: *Load Workload A*, *Load Workload B*, and a dropdown for T1–T7.
2. **Controls**: algorithm select. The quantum input is enabled only for RR (default 2). *Run* button.
3. **Error panel**: lists every validation error. Nothing is rendered when there are errors.
4. **Gantt chart**: one block per segment, labeled with the PID (RR blocks also show `#slice`). Idle blocks are grey and hatched, labeled "idle". There is a time axis with a tick at every segment boundary. RR slice boundaries are always visible (a border between blocks).
5. **Results table**: arrival, burst, first start, completion, TAT, WT, RT, then an averages row (`6.25 (25/4)`).
6. **Verification panel**: ✅/❌ for each of the 5 invariants, plus a detail line on failure.
7. *(optional)* **Compare all**: one table with the averages of all 4 algorithms for the current input.

## 8. Step-by-step mode (stepper)

Adapted from the earlier array visualizer (prev/next/play/pause/fast-finish/reset, step counter, message line):

- Steps are the engine's `events`.
- Controls: ⏮ Reset · ◀ Prev · ▶ Play / ⏸ Pause · Next ▶ · ⏭ Finish, a speed select, and `Step k / n`.
- Shown at the current step:
  - current time `t`
  - running process
  - **ready queue** as chips (FIFO order for RR; sorted by selection key for FCFS/SJF/SRTF, with the key shown, e.g. `P2 (rem 2)`)
  - remaining-time table
  - Gantt revealed up to `t`
  - the event's `detail` message
- Purpose: during the demo, Melik can change an arrival/burst/quantum and walk through *why* each decision happens.

## 9. Workloads

**Required (§4 of the assignment):** A and B with all four algorithms, q = 2 → **8 oracle cases** (from Melik's hand calculations).

**Own tests**: expected results were drafted in the planning chat from the rule text. Melik must confirm them and copy them into `hand.json`.

| ID | Checks | Workload | Expected (draft, to be confirmed) |
|---|---|---|---|
| T1 | Idle at start and in the middle (required) | P1(3,2) P2(10,1), FCFS | idle[0,3) P1[3,5) idle[5,10) P2[10,11) |
| T2 | Simultaneous arrivals + tie (required) | P1(0,3) P2(0,3) P3(0,1), SJF | P3[0,1) P1[1,4) P2[4,7); P1 before P2 by input order |
| T3 | SRTF preempts (required) | P1(0,6) P2(2,2), SRTF | P1[0,2) P2[2,4) P1[4,8) |
| T4 | RR arrival exactly at quantum boundary | P1(0,3) P2(2,2), q=2 | P1[0,2) P2[2,4) P1[4,5) |
| T5 | SRTF equal remaining → no preemption | P1(0,3) P2(2,1), SRTF | P1[0,3) P2[3,4) |
| T6 | RR finishes mid-quantum, no re-entry | P1(0,1) P2(0,2), q=2 | P1[0,1) P2[1,3) |
| T7 | RR consecutive slices of one process stay separate | P1(0,5), q=2 | P1#0[0,2) P1#1[2,4) P1#2[4,5) (3 segments) |

Validation cases: duplicate `p1`/`P1`, `1.5`, `-1`, empty ID, burst 0, quantum 0, over-limit values, empty list.

## 10. Testing & verification

### 10.1 Oracle independence (important)
- `tests/oracle/hand.json` is written **only by Melik** from his paper calculations. Claude Code must **never** fill or "fix" values in it from engine output.
- If the engine and `hand.json` disagree, Claude Code reports the diff and investigates both sides. It logs the case in `dev-log.md` and lets Melik decide which side is wrong.
- Until `hand.json` is committed, Claude Code does **not print or report Workload A/B simulation results**. This keeps the hand calculations "before the simulator", as the assignment requires.
- If `hand.json` entries are missing, `oracle.test.js` **skips with a clear message**. It never silently passes.

`hand.json` format (Melik fills the values; `null` pid = idle):
```json
{
  "A-FCFS": {
    "workload": "A", "algorithm": "FCFS", "quantum": null,
    "segments": [["P1", 0, 0], ["...", 0, 0]],
    "metrics": { "P1": { "firstStart": 0, "completion": 0, "turnaround": 0, "waiting": 0, "response": 0 } },
    "averages": { "turnaround": "0/4", "waiting": "0/4", "response": "0/4" }
  }
}
```
Keys: `A-FCFS, A-SJF, A-SRTF, A-RR2, B-FCFS, B-SJF, B-SRTF, B-RR2, T1…T7`.

The test compares segments, every metric, and the averages. It also checks Melik's arithmetic (TAT = C − A, etc.) so that hand-calculation slips are caught too.

### 10.2 Rule-level tests (Phase 1, no A/B)
T1–T7, plus: an all-idle gap before the first arrival, many simultaneous arrivals, a single process, burst = 1 everywhere, a large quantum (RR == FCFS), and input order ≠ ID order (e.g. rows `P3, P1, P2` arriving together).

### 10.3 Invariants (`verify.js`, run on every simulation, shown in the UI)
1. Each process receives exactly its burst (sum of its segment lengths).
2. No segment starts before the process's arrival.
3. Segments do not overlap, and they are contiguous from the first arrival to the end.
4. Waiting ≥ 0 and response ≥ 0.
5. No idle segment overlaps a time when some process is ready.

### 10.4 Property test
Run about 2,000 random valid workloads (seeded PRNG, so failures are reproducible) through all 4 algorithms, with RR q ∈ {1..5}. Every result must pass all invariants. Additional checks:
- SRTF average waiting ≤ every other algorithm's average waiting (SRTF minimizes average waiting time with zero switch cost; *Claude Code should confirm this claim holds under our tie rules before relying on it, and drop the check if it does not*).
- RR with q ≥ max burst gives the same segments as FCFS.
- Event replay rebuilds the segments.

### 10.5 Build test
- The built `index.html` contains no `import`/`export` statements.
- Its engine portion can be evaluated in Node `vm` and produces the same result as the ES module engine on T1–T7.

## 11. Dev log (`docs/dev-log.md`), the source for the report

Claude Code appends an entry **when it happens**, never invented after the fact:
```
### [HH:MM] Phase N, TYPE
TYPE ∈ BUG | TEST-FAIL | AI-REJECTED | DECISION | DISCREPANCY | CHECKPOINT
What happened:
How it was found (which test/check):
Fix / resolution:
Commit:
```
- Melik also adds his own entries, e.g. AI suggestions he corrected and hand-vs-simulator discrepancies.
- Analysis question 6 and the AI-use statement are written **only from real entries**.

## 12. Report (Phase 5, generated once at the end)

- `scripts/report-data.mjs` runs the engine and writes LaTeX fragments to `report/generated/`:
  - **TikZ Gantt** for each case
  - metrics tables
  - hand vs simulator comparison tables (from `hand.json`, with a diff column)
  - RR q = 1/2/4 sweep (A and B)
  - "compare all" averages
- `report/main.tex` (written at the end from the log + generated data):
  1. Title "CSE513 Assignment 1: CPU Scheduling Simulator", then directly below it the clickable Pages URL (`hyperref`)
  2. Overview & how to run
  3. Eight worked examples (input, hand timeline + metrics, simulator output, comparison, discrepancy explanation)
  4. Own tests T1–T7 (behavior checked, expected, actual)
  5. Invariants + property test summary
  6. Analysis Q1–Q6
  7. AI-use statement
  8. Repository link
- Analysis text is drafted by Claude from the generated data; **Melik reviews and edits** it, since he must be able to defend it.
- Compile in Overleaf or with a local `latexmk`. Only standard packages (`hyperref`, `tikz`, `booktabs`, `geometry`).

## 13. Phases

Each phase ends with a **checkpoint report** and a stop for Melik's approval:
```
## Checkpoint: Phase N
Modules added/changed: …
Tests added: … (what each checks)
`node --test` result: X passed, Y failed, Z skipped (+ failing names)
Invariant/property results: …
Dev-log entries added: …
Open issues / questions for Melik: …
```

| Phase | Work | Exit criteria | ~Time |
|---|---|---|---|
| 0 Setup | Repo skeleton, `CLAUDE.md` (from §14), `limits.js`, empty `dev-log.md`, `hand.json` template, git init | Structure exists, `node --test` runs (0 tests OK) | 15 min |
| 1 Engine + validation | `validate.js`, `scheduler.js` (all 4 + events), `rules.test.js`, `validate.test.js` | T1–T7 + edge cases pass. No A/B output shown | 1.5 h |
| ‖ Melik (parallel) | Hand calcs for A & B (8 cases) → `hand.json`, confirm T1–T7 expectations | `hand.json` committed | — |
| 2 Verification | `verify.js`, `oracle.test.js`, `invariants.test.js`, `property.test.js`; diff vs `hand.json` | All green, or every discrepancy logged and resolved with Melik | 1 h |
| 3 UI + build | `build.mjs`, `build.test.js`, `ui.js` (editor, Gantt, results, verification, stepper), `style.css` | Built `index.html` opens by double-click and runs A/B/T1–T7; errors display correctly | 2 h |
| 4 Deploy | GitHub repo + Pages, README | URL opens in a private window; tested in Safari if available | 20 min |
| 5 Report | `report-data.mjs`, `main.tex`, analysis drafts, AI-use statement from log | PDF compiles; URL is clickable under the heading | 1.5 h |
| 6 Package | ZIP (source + built `index.html` + README), final review | Checklist §15 all ticked | 20 min |

## 14. Rules for Claude Code (copy into `CLAUDE.md`)

1. Follow §3 exactly. If the spec seems ambiguous, **stop and ask**. Do not guess.
2. Never write or modify `tests/oracle/hand.json`. Never derive "expected" values from engine output.
3. Do not show Workload A/B results until `hand.json` is committed.
4. Write tests before or alongside code. A phase is not done while any test fails.
5. Append to `docs/dev-log.md` at the moment a bug, failing test, rejected approach, or decision occurs.
6. Zero dependencies. Respect the module rules in §6.
7. Keep `scheduler.js` pure (no DOM, no globals, deterministic).
8. Stop at the end of each phase with the checkpoint report.
9. Never put personal data (student number, etc.) in the site or repo.
10. Do not invent APIs. If unsure a browser/Node API exists, check the docs or ask.

## 15. Final submission checklist

- [ ] Pages URL works in a private window; it is clickable at the top of the PDF, under the heading
- [ ] Built `index.html` runs by double-click (Mac)
- [ ] 8 worked examples with hand vs simulator comparison + discrepancy notes
- [ ] T1–T7 with purpose, expected, and actual results
- [ ] 5 invariants verified (tests + UI panel)
- [ ] Analysis Q1–Q6 answered and reviewed by Melik
- [ ] AI-use statement (tools, how output was checked, one rejected or corrected suggestion)
- [ ] README: how to run locally, dependencies (none), limitations (limits, model simplifications, not Ubuntu's scheduler)
- [ ] Source ZIP uploaded to Teams with the PDF
- [ ] No student number anywhere

## 16. Open items
- Melik's additional UI ideas (pending; to be added to §7/§8).
- Input limits are provisional (§4).
- SRTF segment merging can be revisited (currently merged).
