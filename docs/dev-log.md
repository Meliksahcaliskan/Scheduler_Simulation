# Dev Log

The running log and the source for the report (PLAN.md §11). Entries are written **when things happen**.
TYPE ∈ BUG | TEST-FAIL | AI-REJECTED | DECISION | DISCREPANCY | CHECKPOINT

---

### [~10:00] Phase −1 (planning), DECISION
What happened: Read the assignment and produced plan v1 (vanilla JS, zero dependencies, GitHub Pages, node --test). Melik revised it into plan v2 (`PLAN.md`): single-file bundled `index.html` for Mac `file://`, a stepper, LaTeX report, phase checkpoints, and oracle independence.
How it was found: Planning review.
Fix / resolution: Plan v2 is authoritative.
Commit: (pre-repo)

### [~10:00] Phase −1 (planning), AI-REJECTED
What happened: In the planning turn, Claude Code hand-calculated all 8 Workload A/B cases itself (`docs/hand-calculations.md`) and printed the averages in chat. Plan v2 §10.1 rejects this: the oracle must come from Melik's independent paper calculations, otherwise oracle tests would compare the AI against itself.
How it was found: Melik's plan review (§0, §10.1).
Fix / resolution: The file is excluded from the repo and never used by tests. Melik decides whether to delete it. Oracle values come only from `tests/oracle/hand.json`.
Commit: (pre-repo)

### [10:25] Phase 0, DECISION
What happened: Rule 2 forbids Claude writing `tests/oracle/hand.json`, but Phase 0 asks for a "hand.json template".
How it was found: Conflict between §13 Phase 0 and §14 rule 2.
Fix / resolution: Created `tests/oracle/hand.template.json` (keys and input metadata only, all values `null`). Melik copies it to `hand.json` and fills it. `oracle.test.js` reads only `hand.json` and skips missing keys.
Commit: Phase 0 initial commit

### [10:25] Phase 0, DECISION
What happened: Added `package.json` with only `"type": "module"` (no dependencies), so Node treats `src/*.js` as ES modules without relying on syntax detection. Added the course PDF to `.gitignore`, since the repo will be public.
How it was found: Setup.
Fix / resolution: As described.
Commit: Phase 0 initial commit

### [10:27] Phase 0, DECISION
What happened: Git warned "LF will be replaced by CRLF" (Windows `core.autocrlf`). The target is a Mac and GitHub Pages, so the line endings should stay LF.
How it was found: Warnings on the first `git add`.
Fix / resolution: Added `.gitattributes` with `* text=auto eol=lf`.
Commit: Phase 0 follow-up

### [10:27] Phase 0, CHECKPOINT
What happened: Skeleton done. `node --test` → 0 tests, exit 0.
How it was found: Ran `node --test`.
Fix / resolution: Waiting for Melik's approval to start Phase 1.
Commit: Phase 0 follow-up

### [10:34] Phase 1, DECISION
What happened: Melik approved Phase 1 and asked to delete `docs/hand-calculations.md` (the AI-computed A/B values).
How it was found: Melik's instruction.
Fix / resolution: File deleted and its `.gitignore` entry removed. It was never committed.
Commit: Phase 1 commit

### [10:35] Phase 1, DECISION
What happened: Chose a discrete-time loop (§3.4). At each integer t the engine runs fixed steps in this order: (1) completion of the process that ran [t−1,t) → (2) arrivals at t in (arrival, index) order → (3) RR quantum expiry, re-enqueued *after* step 2 → (4) SRTF strict-preemption check, only when something arrived → (5) dispatch or start idle → (6) run one unit. The RR boundary rule and "finish before expire" both follow from this step order, not from special cases.
How it was found: Design.
Fix / resolution: Segments are closed only by complete/preempt/quantum-expire, so FCFS/SJF/SRTF never produce adjacent same-process segments and no merge pass is needed (§0 merge rule satisfied by construction; tested). In RR every dispatch opens a new segment with a new `sliceIndex`.
Commit: Phase 1 commit

### [10:35] Phase 1, DECISION
What happened: §5.1 leaves the shape of `running` in event snapshots unspecified.
How it was found: Writing `emit()`.
Fix / resolution: `running` is `{ pid, remaining } | null`, so the stepper's remaining-time table can be built from events alone. Averages are kept unreduced (`num/den` with `den` = process count), matching the `"25/4"` style in hand.json.
Commit: Phase 1 commit

### [10:40] Phase 1, DECISION
What happened: All 36 tests passed on the first run. A first-run pass could also mean weak tests, so I ran a mutation check: three deliberately broken engine copies in a scratch dir, with the test suite run against each.
How it was found: Self-review.
Fix / resolution: Every mutant is caught. (a) SRTF preempting on `<=`: T5 fails. (b) RR re-enqueuing the expired process before same-time arrivals: 6 tests fail, including T4. (c) Tie-break by ID number instead of input row: the "rows P3, P1, P2" edge case fails. The tests do discriminate the key rules.
Commit: Phase 1 commit

### [10:50] Phase 1, DECISION
What happened: Melik asked about the mutation failures. The first run printed only suite-level `not ok` lines, so the test names in the entry above were not yet verified. I reran with subtest names.
How it was found: Melik's question.
Fix / resolution: Verified the exact failing tests. (a) T5 only. (c) "input order ≠ ID order" only. (b) T4, "several arrivals at a boundary keep input order", T7, "single process", "input order ≠ ID order", and "arrivals strictly inside a slice". Of these six, only T4 and the several-arrivals test fail on the queue-order rule itself. The other four fail because mutant (b) also stops emitting the `quantum-expire` event, which the event-replay check catches. The real engine was untouched: the mutants ran on copies in the scratchpad, `src/` is clean, and the suite is 36/36.
Commit: Phase 1 follow-up

### [11:00] Phase 2, DECISION
What happened: `verify.js` recomputes everything from the Gantt segments and the process input only (burst sums, first start, completion), so it does not trust the engine's own metrics. Invariant 4 also flags a results table that disagrees with the Gantt chart. Invariant 3 requires the timeline to start at t=0 (an idle segment before the first arrival is part of the schedule, per the assignment's idle rule) rather than "from the first arrival" (§10.3 wording).
How it was found: Design.
Fix / resolution: As described. Added `src/workloads.js` (A, B, T1–T7 inputs only) because the oracle and invariant tests need the inputs.
Commit: Phase 2 commit

### [11:05] Phase 2, DECISION
What happened: §10.4 asked me to confirm that "SRTF average waiting ≤ every other algorithm" holds under our tie rules before relying on it. Theory: SRTF is SRPT, which minimizes total completion time on one machine with free preemption (Schrage 1968). Since Σwaiting = Σcompletion − Σarrival − Σburst, it also minimizes total waiting. Any tie-break keeps SRPT optimal, because the running job still has minimal remaining time, so "keep on equal" is safe.
How it was found: Property test over 2,000 seeded workloads × 8 configurations: no counterexample.
Fix / resolution: Check kept. Also added two more properties: equal makespan for all algorithms (work-conserving), and SJF == SRTF when all arrivals are simultaneous (useful for analysis Q3).
Commit: Phase 2 commit

### [11:15] Phase 2, DECISION
What happened: Without hand.json, the oracle machinery could not be tested in the real repo. I tested it in a scratch copy with a temporary hand.json for T1 and T3 only (values worked out by hand from the T-case drafts in PLAN.md §9; never in the repo; no A/B).
How it was found: Self-review ("a skip proves nothing").
Fix / resolution: Behaves as intended. A correct entry → 2/2 pass. A wrong hand Gantt (no preemption) → self-consistency and engine-match both fail. An arithmetic slip (WT 3) → self-consistency fails. A decimal average "1.5" → rejected with "write averages as fractions".
Commit: Phase 2 commit

### [11:20] Phase 2, DECISION
What happened: Mutation check of the new invariant and property tests alone. Mutants caught: B (RR re-enqueue order; the random-workload test fails via event replay), C (tie by ID; the "RR q≥max burst == FCFS" property fails), D (CPU idles while ready; 14 failures). **Not caught: A (SRTF preempts on equal remaining) and E (SJF preempts like SRTF).**
How it was found: Scratch mutants run against `invariants.test.js` + `property.test.js` only.
Fix / resolution: This is expected, not a bug. Invariants check that a schedule is *valid*, not that it follows the *policy*: A and E still produce valid schedules. Policy compliance is covered by the rule tests (A → T5 fails; E → "SJF is non-preemptive" fails) and, later, by the oracle. Useful point for the report's verification section.
Commit: Phase 2 commit

### [11:21] Phase 2, CHECKPOINT
What happened: verify.js, workloads.js, invariants/oracle/property tests done. `node --test` → 60 passed, 0 failed, 15 skipped (all oracle cases: no hand.json yet). No Workload A/B results shown.
How it was found: `node --test`.
Fix / resolution: Waiting for Melik's approval to start Phase 3. The oracle stays pending until hand.json is committed.
Commit: Phase 2 commit

### [10:41] Phase 1, CHECKPOINT
What happened: validate.js + scheduler.js (4 algorithms + events) done. `node --test` → 36 passed, 0 failed, 0 skipped. No Workload A/B was run or shown.
How it was found: `node --test`.
Fix / resolution: Waiting for Melik's approval to start Phase 2.
Commit: Phase 1 commit
