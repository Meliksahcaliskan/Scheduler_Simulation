// The single-file build (PLAN.md §6, §10.5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { bundleModules, buildFromDisk, MODULE_ORDER } from '../scripts/build.mjs';
import { simulate, ALGORITHMS } from '../src/scheduler.js';
import { validateInput } from '../src/validate.js';
import { WORKLOADS } from '../src/workloads.js';

const INDEX = new URL('../index.html', import.meta.url);
const built = existsSync(INDEX) ? readFileSync(INDEX, 'utf8').replace(/\r\n/g, '\n') : '';
const scripts = [...built.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const plain = (x) => JSON.parse(JSON.stringify(x)); // drop cross-realm prototypes before comparing

test('index.html is up to date with src/ (if this fails, run: node scripts/build.mjs)', () => {
  assert.ok(built, 'index.html is missing');
  assert.equal(built, buildFromDisk());
});

test('index.html is self-contained: one inline classic script, no modules, no external files', () => {
  assert.equal(scripts.length, 1);
  assert.doesNotMatch(scripts[0], /^\s*(import|export)\b/m);
  assert.doesNotMatch(built, /<script[^>]*\bsrc=|type="module"|<link[^>]*stylesheet|@import|\bfetch\(/);
});

test('the engine inside index.html matches the ES modules on T1–T7 (all algorithms, q = 1, 2, 4)', () => {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(scripts[0], ctx); // no `document` here, so the UI part does not start
  const api = ctx.window.CPUScheduler;
  for (const key of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']) {
    const w = WORKLOADS[key].processes;
    for (const a of ALGORITHMS) {
      for (const q of a === 'RR' ? [1, 2, 4] : [null]) {
        assert.deepEqual(plain(api.simulate(w, a, q)), plain(simulate(w, a, q)), `${key} ${a} ${q ?? ''}`);
      }
    }
  }
  assert.deepEqual(plain(api.validateInput([{ id: 'p1', arrival: '1.5', burst: '0' }], 'RR', '0')),
    validateInput([{ id: 'p1', arrival: '1.5', burst: '0' }], 'RR', '0'));
});

test('ui.js never writes HTML strings (IDs are user input)', () => {
  const ui = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('the bundler fails loudly on unsupported module syntax', () => {
  const base = Object.fromEntries(MODULE_ORDER.map((n) => [n, '']));
  const bad = (name, text, pattern) => assert.throws(() => bundleModules({ ...base, [name]: text }), pattern, text);
  bad('limits', 'export default 1;', /unsupported export/);
  bad('limits', 'export { a };', /unsupported export/);
  bad('limits', "export * from './x.js';", /unsupported export/);
  bad('limits', 'export let x = 1;', /unsupported export/);
  bad('ui', "const m = await import('./x.js');", /unsupported import/);
  bad('ui', "import x from './scheduler.js';", /unsupported import/);
  bad('ui', 'import {\n  simulate,\n} from \'./scheduler.js\';', /unsupported import/);
  bad('validate', "import { nope } from './limits.js';", /does not export/);
  bad('limits', "import { simulate } from './scheduler.js';", /not bundled before/);
  bad('limits', 'const { a } = obj;', /destructuring/);
  assert.throws(() => bundleModules({ ...base, limits: 'const dup = 1;', ui: 'function dup() {}' }), /already declared/);
});
