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
