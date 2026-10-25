# CLAUDE.md: CSE513 Assignment 1 (CPU Scheduling Simulator)

The full plan and spec are in `PLAN.md` (§3 algorithm spec, §4 validation, §6 module/bundler rules). The running log is in `docs/dev-log.md`.

## Rules for Claude Code
1. Follow PLAN.md §3 exactly. If the spec seems ambiguous, **stop and ask**. Do not guess.
2. Never write or modify `tests/oracle/hand.json`. Never derive "expected" values from engine output.
3. Do not show Workload A/B results until `hand.json` is committed.
4. Write tests before or alongside code. A phase is not done while any test fails.
5. Append to `docs/dev-log.md` at the moment a bug, failing test, rejected approach, or decision occurs.
6. Zero dependencies. Respect the module rules in PLAN.md §6:
   - only single-line `import { a, b } from './x.js';`
   - only `export function` / `export const`
   - no default exports, no re-exports, no dynamic import
   - top-level names unique across modules
7. Keep `scheduler.js` pure (no DOM, no globals, deterministic).
8. Stop at the end of each phase with the checkpoint report (PLAN.md §13).
9. Never put personal data (student number, etc.) in the site or repo.
10. Do not invent APIs. If unsure a browser/Node API exists, check the docs or ask.

## Commands
- Tests: `node --test`
- Build (Phase 3+): `node scripts/build.mjs` → `./index.html`
