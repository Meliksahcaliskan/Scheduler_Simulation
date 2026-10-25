# UI Improvements: CSE513 Scheduling Simulator

> Input: the currently published `index.html` (built from `src/`).
> Goal: easier to use, nicer to look at, and better for the **live demo** ("change an arrival/burst/quantum and explain the result").
> UI is 10% of the grade and the deadline is tonight. Work **tier by tier** and stop after each tier with a checkpoint report.

---

## 0. Ground rules (do not break)

1. **Do not change scheduling behavior.** `scheduler.js`, `validate.js` and `verify.js` may only receive additive, non-behavioral changes. If one seems needed, stop and ask Melik.
2. All existing tests must stay green (`node --test`). Rebuild with `node scripts/build.mjs` after every change. The built `index.html` must still open by **double-click on a Mac** (`file://`, Safari + Chrome).
3. Zero dependencies, **no external fonts/CDNs**. The page must work offline.
4. User text goes into the DOM only through text nodes (the existing `h()` builder). No `innerHTML`.
5. Keep the module rules required by `build.mjs` (single-line named imports, `export function` / `export const` only).
6. Log any bug found or rejected idea in `docs/dev-log.md`.
7. **Regression checklist.** Every item must still work after each tier:
   - [ ] Add / edit / remove processes; ID, arrival, burst inputs
   - [ ] Algorithm select + RR quantum input
   - [ ] Run → labeled Gantt chart **including idle intervals**
   - [ ] RR quantum boundaries visible even for consecutive slices of the same process (T7)
   - [ ] Results table: arrival, burst, first start, completion, turnaround, waiting, response + averages
   - [ ] Load Workload A / B, test cases T1–T7
   - [ ] Clear validation messages for invalid input
   - [ ] Verification panel (5 invariants)
   - [ ] Stepper works (prev / next / play / finish / keyboard ←/→)
   - [ ] Existing `#load=…&algo=…&run=1` hash links still work

---

## Tier 1: high value, low risk (do first, ~1 h)

### 1.1 Two-column layout on wide screens
- At ≥ 1000 px: a left column (Processes + Algorithm) that is `position: sticky`, and a right column with the results. Below 1000 px, keep the current single column.
- Effect: you can edit inputs and see the result at the same time without scrolling. This is the core of the demo.

### 1.2 Algorithm as segmented buttons
- Replace the `<select>` with 4 toggle buttons: `FCFS | SJF | SRTF | RR`, each with a short subtitle ("non-preemptive", "preemptive", "quantum").
- Show the quantum control **only** when RR is selected, with − / + buttons beside the input.
- Keep a `<select>`-equivalent value internally so the hash links (`algo=`) keep working.

### 1.3 Auto-run (live mode)
- A checkbox "Auto-run on change", **on by default**. When the input is valid, any edit, algorithm change, or quantum change re-runs immediately (debounce ≈ 200 ms).
- When the input is invalid, keep the last valid result visible but dimmed, with the existing stale note, and show the errors.
- With auto-run off, the current behavior (Run button + stale note) stays.
- Also run once on page load, so Workload A shows results immediately (currently the page opens with no results).
- Shortcut: **Ctrl/⌘ + Enter** = Run.

### 1.4 Process color everywhere
- A small color swatch in each editor row, results-table row, stepper remaining-table row, and the ready-queue chips. Use the same `processColor(index)` as the Gantt.
- Use slightly more saturated colors than the current 80% lightness so blocks stand out, but keep black text readable (contrast ≥ 4.5:1).

### 1.5 Inline field errors
- Besides the top error list, mark the offending input with a red border, `aria-invalid="true"`, and a tooltip/title containing its message.
- The error list stays, since it is required "clear explanation" evidence. Each item can be clicked to focus its field.
- Implementation: map errors to (row, field) **in `ui.js`** by re-checking each field with the same rules. Do not change `validate.js` output (Rule 1). Alternatively, add a new *additive* exported helper in `validate.js` that returns field-level errors, plus tests for it.

### 1.6 Editor ergonomics
- Pressing Enter in the last row's burst field adds a new row and focuses its ID.
- `inputmode="numeric"` is already set. Also add `autocomplete="off"`.
- Show the process count `n / 30` next to "+ Add process".

### 1.7 Results tabs
- Make the result area tabbed: **Results · Step-by-step · Compare**. The tab state goes into the hash (`tab=`).
- This removes the long single page and the duplicated Gantt scroll.

---

## Tier 2: makes the demo and the report clearer (~1 h)

### 2.1 Arrival & completion markers on the Gantt
- Under the time axis, add a small ▲ labeled with the PID at each arrival time. Multiple arrivals at the same time stack. Add a small ● at each completion time.
- This makes "why did X start here?" visible without the stepper.

### 2.2 Linked hover
- Hovering a Gantt block highlights that process's row in the results table, and the reverse. Other processes' blocks fade slightly.

### 2.3 Better time axis
- Add faint vertical grid lines at every unit (or every 5 units when there are more than about 40 units). Keep the labeled ticks at segment boundaries.
- Keep a minimum block width so 1-unit blocks stay readable. Already handled by `unit ≥ 24px`; check it with T6/T7.

### 2.4 Compare tab: stacked Gantts + bars
- Show all 4 Gantt charts **stacked on the same time scale** (one row per algorithm). This makes the clearest possible figure for Analysis Q1 and the report.
- Below them, show a pure-CSS bar chart (no library) of average TAT / WT / RT per algorithm, with the best values highlighted.
- Also fix the issue in §4.1 for this tab.

### 2.5 Stepper upgrades
- **Event log list** beside or under the stepper: every event (`t`, type badge, detail). The current one is highlighted, auto-scrolls into view, and clicking an event jumps to it.
- Add **"◀ Prev time / Next time ▶"** buttons that jump between distinct `t` values. Several events can share one time, and stepping through each one is slow during a demo.
- Ready-queue chips should animate their position (CSS transition) so a process joining the tail or being re-enqueued is visible.

### 2.6 Verification summary badge
- Collapse the list into a badge: "✅ 5/5 invariants pass". Click to expand. If any check fails, it is **auto-expanded** and shown in red.

### 2.7 Shareable scenario link
- A "Copy link" button that writes the current rows/algorithm/quantum/tab into the hash (the format already exists: `#p=P1:0:3,...&algo=RR&q=2&run=1`) and copies it to the clipboard.
- Useful for linking each worked example from the report.
- If `navigator.clipboard` is unavailable (it can be on `file://`), select the URL in a text field instead. *Verify the clipboard behavior on Safari/file://; do not assume it works.*

---

## Tier 3: polish (only if time remains)

- **Dark mode** via `prefers-color-scheme`, with a manual toggle stored in `localStorage` (wrapped in try/catch, since storage can throw on `file://`).
- **Collapsible "Rules used"** panel (`<details>`): tie-breaking order, SRTF strict preemption, RR boundary rule, half-open intervals. This is good for the demo and costs no space when closed.
- **RR quantum sweep** in the Compare tab: averages for q = 1, 2, 4 (and the current q). Gives direct data for Analysis Q2.
- **Copy results as Markdown/CSV** button for the metrics table.
- **Print stylesheet**: hide the controls and keep the Gantt + tables, so a clean PDF or screenshot can be made for the report.
- **Small visual polish**: rounded Gantt blocks, a subtle card shadow, a consistent 8 px spacing scale, a header with the repo link in the footer.
- **Accessibility**: each Gantt block gets `role="img"` + an `aria-label` equal to its title; visible `:focus-visible` outlines; buttons reachable by keyboard.

---

## 4. Issues found while reading the current code

1. **Compare uses a hidden/disabled quantum.** `compareAll()` validates the quantum field even when the algorithm isn't RR, and that field is disabled then. An invalid value there produces an error the user can't fix without switching to RR. Fix: in the Compare view, show the quantum used (`RR (q = …)`) and keep the quantum control editable or clearly explained there.
2. **Error path in `run()` leaves old results visible.** If `simulate()` throws, errors are shown but `results`/`stepper` are not hidden or marked stale. Fix: mark them stale or hide them, consistent with the validation-error path.
3. **No results on first load.** Workload A is loaded but not run. This is covered by 1.3.
4. *(Check)* `status.replace(' ', '-')` only replaces the first space. It is fine for the current status strings, but use `replaceAll` or a lookup to be safe.

---

## 5. Checkpoint report after each tier

```
## Checkpoint: UI Tier N
Items done: 1.1, 1.2, … (and any skipped, with reason)
Files changed: …
`node --test`: X passed / Y failed / Z skipped
Regression checklist (§0.7): all ticked? (list any failures)
Tested in: Chrome / Safari (file://) / GitHub Pages
Screenshots or notes on anything that looks off:
Dev-log entries added:
```

## 6. Decisions for Melik (defaults in bold)
- Auto-run default: **on** / off
- Tabs vs. one long page: **tabs**
- Dark mode: include in Tier 3 / **skip**
