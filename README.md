# CPU Scheduling Simulator (CSE513 Assignment 1)

A browser-based simulator for four CPU scheduling policies: **FCFS**, **SJF** (non-preemptive), **SRTF** (preemptive) and **Round Robin** (configurable quantum).
It draws a labeled Gantt chart (including CPU idle time), computes per-process and average metrics, verifies five correctness invariants on every run, and replays each scheduling decision step by step.

**Live site:** https://meliksahcaliskan.github.io/Scheduler_Simulation/

## Run it locally

No installation, server or internet connection is needed.

1. Download or clone this repository (or unzip the submitted archive).
2. Open **`index.html`** in a browser: double-click it, or on macOS run `open index.html`.

`index.html` is a single self-contained file (all JavaScript and CSS inline), so it works from `file://`.

### Using the simulator
On a wide screen the inputs stay on the left and the results on the right.
1. **Processes:** edit the table (ID, arrival time, CPU burst), add or remove rows (Enter in the last CPU burst adds one), or click **Load Workload A / B** or pick a test case **T1–T7**.
2. **Algorithm:** click FCFS, SJF, SRTF or RR. The time quantum (− / +) is shown for Round Robin (default 2) and on the Compare tab.
3. **Auto-run** (on by default) re-runs the simulation after every change. With it off, press **Run simulation** or Ctrl/⌘ + Enter.
4. **Results** tab: the Gantt chart (▲ arrivals and ● completions under the axis), the results table with averages, and the verification badge (click to expand; it opens by itself if a check fails). Hovering a Gantt block or a table row highlights that process in both.
5. **Step-by-step** tab: Play / Pause, Prev / Next (← / →), Prev time / Next time (Shift + ← / →, jumps to the last event at the previous / next time), Reset and Finish. Each step shows the time, the running process, the ready queue and the rule behind the decision. The event log lists every event; click one to jump to it.
6. **Compare** tab: the four Gantt charts stacked on one time scale, plus average turnaround, waiting and response time of all four algorithms as a table and as bars.
7. **Copy link** puts the current processes, algorithm, quantum and tab into the URL and copies it. Where the browser blocks the clipboard, the link is shown selected instead.

Invalid input is rejected with a list of every problem, tied to its row and marked on the field itself (e.g. `Row 3: ID "p1" duplicates "P1" in row 1 (IDs are case-insensitive).`).

**Demo links:** state can be set from the URL hash (the page always runs on load), for example
`index.html#load=T3&step=4` (opens the stepper at step 4), `index.html#load=A&algo=RR&q=4`,
or custom rows `index.html#p=P1:0:5,P2:1:3&algo=SRTF`. `&tab=results|step|compare` picks the tab (`&compare=1` also opens the comparison; the older `&run=1` is still accepted).

## Scheduling model and rules

- One CPU, one CPU burst per process, no I/O, zero-cost context switches. Integer time; intervals are half-open (`[2, 5)` = 3 units).
- The CPU never idles while a process is ready; otherwise an explicit idle interval runs until the next arrival.
- **FCFS** picks the earliest arrival. **SJF** picks the shortest burst, only when the CPU becomes free.
  **SRTF** picks the shortest remaining time and preempts only when an arriving process is *strictly* shorter (on equal time, the running process continues).
- **Ties:** earlier arrival, then earlier row in the input table.
- **Round Robin:** FIFO ready queue; arrivals join the tail. At a quantum boundary, processes arriving at that exact time are enqueued *before* the preempted process. A finished process never re-enters the queue. Every slice is its own Gantt block (`#1`, `#2`, …), so consecutive slices of the same process stay visible.
- **Metrics:** Turnaround = Completion − Arrival; Waiting = Turnaround − Burst; Response = First start − Arrival. Averages are exact fractions, shown as e.g. `6.25 (25/4)`.

## Development

**Dependencies:** none at runtime. For tests and building: [Node.js](https://nodejs.org/), tested with v22.17.1 (any release with the built-in `node --test` runner, Node 20+, should work). There is no `npm install`, and the project uses only Node's built-in modules.

```sh
node --test              # run all tests
node scripts/build.mjs   # rebuild index.html from src/ (commit the result)
```

`index.html` is generated, so don't edit it by hand. Edit `src/` and rebuild. A test fails if the committed `index.html` is out of date.

```
src/
  limits.js            input limits (one place)
  validate.js          input validation → list of readable errors
  scheduler.js         pure engine: simulate(processes, algorithm, quantum) → segments, metrics, averages, events
  verify.js            the five invariants, recomputed from the Gantt chart
  format.js            average formatting
  workloads.js         Workloads A, B and test cases T1–T7
  ui.js                browser UI (editor, Gantt, results, verification, stepper, compare)
  index.template.html, style.css
scripts/build.mjs      bundles src/ into the single-file index.html (enforces simple module rules)
tests/                 node:test suites (see below)
docs/dev-log.md        development log: decisions, bugs found, how tests exposed them
```

### Tests
- `rules.test.js`: every scheduling rule and edge case (T1–T7, ties, RR boundaries, SRTF strictness, idle gaps, …). Every run also checks that replaying the event log rebuilds the Gantt chart.
- `validate.test.js`: every invalid-input case and its message.
- `invariants.test.js`: the five invariants hold for all presets, and the checker detects deliberately broken schedules.
- `property.test.js`: 2,000 seeded random workloads × all algorithms (RR q = 1–5). It checks the invariants, event replay, SRTF's minimal average waiting time, RR with a large quantum = FCFS, equal makespan for all algorithms, and SJF = SRTF for simultaneous arrivals. Another seed can be used with `PROPERTY_SEED=7 node --test tests/property.test.js`.
- `oracle.test.js`: compares the engine with independent hand calculations in `tests/oracle/hand.json` (cases are skipped, never passed, until filled in).
- `build.test.js`, `format.test.js`: the single-file build and the number formatting.

## Report

The PDF report is `report/main.pdf`. To rebuild it: `node scripts/report-data.mjs` (runs the engine and the tests, and writes the tables and TikZ Gantt charts to `report/generated/`), then `latexmk -pdf main.tex` inside `report/`. It uses only standard LaTeX packages. Hand-calculated values come from `tests/oracle/hand.json` (transcribed from the handwritten pages in `tests/oracle/*.pdf`).

## Limitations

- **Model, not a real OS:** this simulator models textbook scheduling policies. It does not reproduce Ubuntu's (or any real OS's) scheduler. There is no I/O, there are no priorities, no multiple CPUs and no context-switch cost. Burst lengths are known exactly, whereas a real OS must estimate them.
- **Input limits** (set in `src/limits.js`): at most 30 processes, arrival time ≤ 500, CPU burst ≤ 100, quantum ≤ 100. IDs are 1–12 characters, unique ignoring case.
- Time is discrete (integer units). The engine steps one time unit at a time, which is simple to verify and fast at these limits.
- Tested in Google Chrome (Windows) over `file://` and on GitHub Pages. It uses only standard browser features (no frameworks, no network requests).
