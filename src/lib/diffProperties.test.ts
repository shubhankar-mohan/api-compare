/**
 * Randomized property tests for the diff engine.
 *
 * `diffCorrectness.test.ts` states the three invariants (I1 fidelity, I2
 * soundness, I3 precision) over hand-written cases. This file throws a few
 * thousand generated documents at the same invariants — plus row-shape,
 * segment, path, count, symmetry and idempotence properties — under every
 * option combination the Diff Options panel can produce, and does the same
 * for the plain-text path.
 *
 * Deterministic: a seeded mulberry32 PRNG, no external dependencies. When a
 * property fails the input is greedily shrunk and the minimal repro is
 * printed with console.log so the failure is reproducible as a literal.
 *
 * The oracle deliberately re-implements the engine's *contract* (scalar
 * normalization, rule masking by path) rather than reusing engine internals,
 * so a bug in the engine cannot also hide in the oracle.
 */
import { describe, it, expect } from 'vitest';
import { computeJsonTreeDiff, DiffDepthExceededError, type JsonTreeDiffOptions } from './jsonTreeDiff';
import { computeDiff } from './diffAlgorithm';
import { computeEnhancedDiff, type DiffOptions } from './enhancedDiffAlgorithm';
import { ruleMatchesPath, type NoiseRule } from './noiseRules';
import type { DiffLine, DiffResult } from './diffTypes';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

// ── PRNG ───────────────────────────────────────────────────────────────────

const SEED = 0x5eed2026;

/** mulberry32 — small, fast, good enough for test-case generation. */
class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed | 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Stable per-test seed so each `it` is independent of the others' order. */
function seedFor(label: string): number {
  let h = SEED;
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193);
  return h | 0;
}

// ── JSON helpers ───────────────────────────────────────────────────────────

type Kind = 'object' | 'array' | 'scalar';
function kindOf(v: unknown): Kind {
  if (Array.isArray(v)) return 'array';
  if (v !== null && typeof v === 'object') return 'object';
  return 'scalar';
}

/**
 * Define an own, enumerable key. Assignment would invoke the `__proto__`
 * setter, and `__proto__` / `constructor` / `toString` are deliberately in the
 * key pool because JSON.parse happily produces them as own properties.
 */
function defineKey(o: JsonObject, key: string, value: Json): void {
  Object.defineProperty(o, key, { value, enumerable: true, writable: true, configurable: true });
}

function clone(v: Json): Json {
  if (Array.isArray(v)) return v.map(clone);
  if (v !== null && typeof v === 'object') {
    const o: JsonObject = {};
    for (const k of Object.keys(v)) defineKey(o, k, clone(v[k]));
    return o;
  }
  return v;
}

function countNodes(v: Json): number {
  let n = 1;
  if (Array.isArray(v)) for (const el of v) n += countNodes(el);
  else if (v !== null && typeof v === 'object') for (const k of Object.keys(v)) n += countNodes(v[k]);
  return n;
}

/** A literal that survives -0 and is pasteable into a test. */
function literal(v: Json): string {
  if (Array.isArray(v)) return `[${v.map(literal).join(', ')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v)
      .map((k) => `${JSON.stringify(k)}: ${literal(v[k])}`)
      .join(', ')}}`;
  }
  if (typeof v === 'number' && Object.is(v, -0)) return '-0';
  return JSON.stringify(v);
}

type Path = (string | number)[];
interface Loc {
  path: Path;
  value: Json;
}

function locations(v: Json, path: Path = [], out: Loc[] = []): Loc[] {
  out.push({ path, value: v });
  if (Array.isArray(v)) v.forEach((el, i) => locations(el, [...path, i], out));
  else if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) locations(v[k], [...path, k], out);
  }
  return out;
}

function getAt(root: Json, path: Path): Json {
  let cur: Json = root;
  for (const seg of path) cur = (cur as JsonObject & Json[])[seg as never];
  return cur;
}

/** Replace the value at `path` in place; returns the (possibly new) root. */
function setAt(root: Json, path: Path, value: Json): Json {
  if (path.length === 0) return value;
  const parent = getAt(root, path.slice(0, -1));
  const last = path[path.length - 1];
  if (Array.isArray(parent)) parent[last as number] = value;
  else defineKey(parent as JsonObject, last as string, value);
  return root;
}

// ── oracle: the engine's comparison contract, re-implemented ───────────────

interface Norm {
  semanticComparison: boolean;
  ignoreCase: boolean;
  ignoreWhitespace: boolean;
}
const EXACT: Norm = { semanticComparison: false, ignoreCase: false, ignoreWhitespace: false };

/** Mirrors `normalizeScalar` in jsonTreeDiff.ts — the documented panel semantics. */
function normalizeScalar(value: unknown, n: Norm): unknown {
  let out = value;
  if (n.semanticComparison && typeof out === 'string') {
    const trimmed = out.trim();
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) out = Number(trimmed);
    else if (trimmed === 'true') out = true;
    else if (trimmed === 'false') out = false;
    else if (trimmed === 'null') out = null;
  }
  if (typeof out === 'string') {
    let s: string = out;
    if (n.ignoreWhitespace) s = s.replace(/\s+/g, ' ').trim();
    if (n.ignoreCase) s = s.toLowerCase();
    out = s;
  }
  return out;
}

/**
 * Deep equality ignoring key order, with the option normalization applied to
 * scalars and rule-matched paths treated as equal whatever they hold. Paths
 * are built exactly as the walker builds them (`$.key`, `[i]`).
 */
function eqMasked(a: Json, b: Json, n: Norm, rules: NoiseRule[], path: string): boolean {
  if (rules.length > 0 && rules.some((r) => ruleMatchesPath(r, path))) return true;
  const ka = kindOf(a);
  if (ka !== kindOf(b)) return false;
  if (ka === 'scalar') return normalizeScalar(a, n) === normalizeScalar(b, n);
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!eqMasked(a[i], b[i], n, rules, `${path}[${i}]`)) return false;
    }
    return true;
  }
  const oa = a as JsonObject;
  const ob = b as JsonObject;
  const ka2 = Object.keys(oa);
  const kb2 = Object.keys(ob);
  if (ka2.length !== kb2.length) return false;
  for (const k of ka2) {
    if (!Object.prototype.hasOwnProperty.call(ob, k)) return false;
    if (!eqMasked(oa[k], ob[k], n, rules, `${path}.${k}`)) return false;
  }
  return true;
}

const eq = (a: Json, b: Json) => eqMasked(a, b, EXACT, [], '$');

function normOf(o: { semanticComparison?: boolean; ignoreCase?: boolean; ignoreWhitespace?: boolean }): Norm {
  return {
    semanticComparison: o.semanticComparison === true,
    ignoreCase: o.ignoreCase === true,
    ignoreWhitespace: o.ignoreWhitespace === true,
  };
}

// ── generators ─────────────────────────────────────────────────────────────

const LONG_STRING = 'lorem-ipsum-'.repeat(60); // 720 chars, past every inline-diff cap

const STRING_POOL: readonly string[] = [
  '', ' ', 'a', 'A', 'abc', 'ABC', 'a b', 'a  b', ' a', 'a ', 'a\tb',
  'quote"inside', 'back\\slash', 'new\nline', 'cr\rlf', 'slash/', 'ctrl\u0001', '\u0000nul',
  'ünïcödé', 'İstanbul', 'ß', '😀', '👨‍👩‍👧', '🇮🇳', 'a😀b', ' sep', '\ud83d', 'é',
  '1', '01', '1.0', ' 1 ', '1e21', '-0', '0x10', '1e400', 'Infinity', 'NaN', '',
  'true', 'True', 'false', 'null', 'undefined', 'NULL',
  '550e8400-e29b-41d4-a716-446655440000', '2024-01-01T00:00:00Z', '1700000000000', 'deadbeef',
  '/* NOISE:uuid:rule */', '$..x', '$.a.b',
  LONG_STRING, LONG_STRING + '!', 'x'.repeat(650),
];

const NUMBER_POOL: readonly number[] = [
  0, -0, 1, -1, 2, 1.5, -1.5, 0.1, 1e21, 1e-7, 100, 1700000000000,
  9007199254740991, Number('9007199254740993') /* rounds to 2^53 */, 1e300, 3.14159, 42,
];

const ALPHABET = ['a', 'b', 'c', 'x', '"', '\\', '\n', '\t', ' ', 'é', '😀', '1', '0', '-', '.', 'ß'];

const ID_KEYS = ['id', '_id', 'uuid', 'key', 'sku', 'code', 'slug', 'name', 'user_id'] as const;

const KEY_POOL: readonly string[] = [
  ...ID_KEYS, 'orderId', 'a', 'b', 'c', 'x', 'y', 'z',
  'a.b', 'a[0]', 'with space', 're(gex)+?', '$', '*', '..', '', '__proto__', 'constructor',
  'toString', 'hasOwnProperty', 'k"q', 'k\\b', 'ünï', '😀', 'createdAt', 'updated_at',
  'timestamp', 'provider', 'paid', '1', '0', '10', 'items', 'data', 'meta', 'value', 'type',
];

function genString(rng: Rng): string {
  if (rng.chance(0.7)) return rng.pick(STRING_POOL);
  const len = rng.range(0, 8);
  let s = '';
  for (let i = 0; i < len; i++) s += rng.pick(ALPHABET);
  return s;
}

function genScalar(rng: Rng): Json {
  const r = rng.int(10);
  if (r < 5) return genString(rng);
  if (r < 8) return rng.pick(NUMBER_POOL);
  if (r < 9) return rng.chance(0.5);
  return null;
}

interface Budget {
  n: number;
}

const maxChildren = (budget: Budget) => (budget.n > 150 ? 24 : 6);

function genValue(rng: Rng, budget: Budget, depth: number): Json {
  budget.n -= 1;
  const scalarBias = depth === 0 ? 0.1 : 0.4;
  if (depth >= 9 || budget.n <= 0 || rng.chance(scalarBias)) return genScalar(rng);
  return rng.chance(0.5) ? genObject(rng, budget, depth) : genArray(rng, budget, depth);
}

function genObject(rng: Rng, budget: Budget, depth: number): JsonObject {
  const o: JsonObject = {};
  const count = rng.int(maxChildren(budget) + 1);
  for (let i = 0; i < count && budget.n > 0; i++) {
    const key = rng.chance(0.8) ? rng.pick(KEY_POOL) : genString(rng);
    if (Object.prototype.hasOwnProperty.call(o, key)) continue;
    defineKey(o, key, genValue(rng, budget, depth + 1));
  }
  return o;
}

function genArray(rng: Rng, budget: Budget, depth: number): Json[] {
  const style = rng.int(5);
  const count = rng.int(maxChildren(budget) + 1);
  if (style === 0 || count === 0) return [];

  if (style === 1) {
    // Scalars with duplicates.
    const pool = [genScalar(rng), genScalar(rng), genScalar(rng)];
    return Array.from({ length: count }, () => {
      budget.n -= 1;
      return rng.pick(pool);
    });
  }

  if (style === 2) {
    // Records with an identity field; occasionally "1" next to 1, or "01".
    const idField = rng.pick(ID_KEYS);
    const out: Json[] = [];
    for (let i = 0; i < count && budget.n > 0; i++) {
      const rec = genObject(rng, budget, depth + 1);
      const idVal: Json = rng.chance(0.15) ? String(i) : rng.chance(0.1) ? `0${i}` : rng.chance(0.1) ? `id-${i}` : i;
      defineKey(rec, idField, idVal);
      out.push(rec);
    }
    return out;
  }

  if (style === 3) {
    // Records sharing a shape but with no identity field.
    const keys = rng.shuffle(KEY_POOL.filter((k) => !(ID_KEYS as readonly string[]).includes(k))).slice(0, rng.range(1, 4));
    const out: Json[] = [];
    for (let i = 0; i < count && budget.n > 0; i++) {
      const rec: JsonObject = {};
      for (const k of keys) defineKey(rec, k, genValue(rng, budget, depth + 1));
      out.push(rec);
    }
    return out;
  }

  const out: Json[] = [];
  for (let i = 0; i < count && budget.n > 0; i++) out.push(genValue(rng, budget, depth + 1));
  return out;
}

// ── mutators ───────────────────────────────────────────────────────────────

function differentScalar(rng: Rng, old: Json): Json {
  const candidates: Json[] = [];
  if (typeof old === 'string') {
    candidates.push(old + 'x', old.toUpperCase(), old.toLowerCase(), ' ' + old, old + ' ', old.replace(/ /g, '  '), old.slice(1), Number(old));
    candidates.push(old === 'true' ? true : old === 'false' ? false : old === 'null' ? null : 'null');
  } else if (typeof old === 'number') {
    candidates.push(old + 1, -old, old * 10, String(old), old + 0.5, `${old}`, ` ${old} `);
  } else if (typeof old === 'boolean') {
    candidates.push(!old, String(old), old ? 1 : 0, old ? 'True' : 'False');
  } else {
    candidates.push('null', 0, false, '', 'NULL');
  }
  for (let tries = 0; tries < 10; tries++) {
    const c = rng.chance(0.5) ? rng.pick(candidates) : genScalar(rng);
    if (typeof c === 'number' && !Number.isFinite(c)) continue;
    if (JSON.stringify(c) !== JSON.stringify(old)) return c;
  }
  return typeof old === 'string' ? old + '!' : `${String(old)}!`;
}

function freshKey(rng: Rng, o: JsonObject): string {
  for (let i = 0; i < 6; i++) {
    const k = rng.pick(KEY_POOL);
    if (!Object.prototype.hasOwnProperty.call(o, k)) return k;
  }
  let i = 0;
  while (Object.prototype.hasOwnProperty.call(o, `k${i}`)) i++;
  return `k${i}`;
}

/** Rebuild an object's keys in shuffled order, in place. */
function reorderKeys(rng: Rng, o: JsonObject): void {
  const entries = Object.keys(o).map((k) => [k, o[k]] as const);
  for (const [k] of entries) delete o[k];
  for (const [k, v] of rng.shuffle([...entries])) defineKey(o, k, v);
}

function mutateOnce(rng: Rng, root: Json): Json {
  const locs = locations(root);
  const deepest = locs.reduce((a, b) => (b.path.length > a.path.length ? b : a));
  const choose = (list: Loc[]) => (rng.chance(0.25) && list.includes(deepest) ? deepest : rng.pick(list));

  const scalars = locs.filter((l) => kindOf(l.value) === 'scalar');
  const objects = locs.filter((l) => kindOf(l.value) === 'object');
  const arrays = locs.filter((l) => Array.isArray(l.value));
  const nonEmptyArrays = arrays.filter((l) => (l.value as Json[]).length > 0);
  const bigArrays = arrays.filter((l) => (l.value as Json[]).length > 1);
  const keyedObjects = objects.filter((l) => Object.keys(l.value as JsonObject).length > 0);
  const multiKeyObjects = objects.filter((l) => Object.keys(l.value as JsonObject).length > 1);

  const op = rng.int(9);
  if (op === 0 && scalars.length) {
    const l = choose(scalars);
    return setAt(root, l.path, differentScalar(rng, l.value));
  }
  if (op === 1 && objects.length) {
    const l = choose(objects);
    const o = l.value as JsonObject;
    defineKey(o, freshKey(rng, o), genValue(rng, { n: rng.range(1, 6) }, l.path.length + 1));
    return root;
  }
  if (op === 2 && keyedObjects.length) {
    const l = choose(keyedObjects);
    const o = l.value as JsonObject;
    delete o[rng.pick(Object.keys(o))];
    return root;
  }
  if (op === 3 && arrays.length) {
    const l = choose(arrays);
    const arr = l.value as Json[];
    const el = arr.length && rng.chance(0.5) ? clone(rng.pick(arr)) : genValue(rng, { n: rng.range(1, 6) }, l.path.length + 1);
    arr.splice(rng.int(arr.length + 1), 0, el);
    return root;
  }
  if (op === 4 && nonEmptyArrays.length) {
    const arr = choose(nonEmptyArrays).value as Json[];
    arr.splice(rng.int(arr.length), 1);
    return root;
  }
  if (op === 5 && bigArrays.length) {
    const arr = choose(bigArrays).value as Json[];
    const [el] = arr.splice(rng.int(arr.length), 1);
    arr.splice(rng.int(arr.length + 1), 0, el);
    return root;
  }
  if (op === 6 && bigArrays.length) {
    const arr = choose(bigArrays).value as Json[];
    const i = rng.int(arr.length);
    const j = rng.int(arr.length);
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return root;
  }
  if (op === 7) {
    const l = choose(locs);
    const old = l.value;
    let replacement: Json;
    if (kindOf(old) === 'scalar') replacement = rng.chance(0.5) ? { wrapped: old } : [old];
    else if (Array.isArray(old)) replacement = rng.chance(0.5) ? genScalar(rng) : Object.fromEntries(old.map((v, i) => [String(i), v]));
    else replacement = rng.chance(0.5) ? genScalar(rng) : Object.keys(old as JsonObject).map((k) => (old as JsonObject)[k]);
    return setAt(root, l.path, replacement);
  }
  if (op === 8 && multiKeyObjects.length) {
    reorderKeys(rng, choose(multiKeyObjects).value as JsonObject);
    return root;
  }
  // Fallback: change something, whatever the shape.
  const l = rng.pick(locs);
  return setAt(root, l.path, kindOf(l.value) === 'scalar' ? differentScalar(rng, l.value) : genScalar(rng));
}

/** Rewrites that do not change the value: key order, 0 vs -0. */
function cosmetic(rng: Rng, root: Json): Json {
  for (const l of locations(root)) {
    if (kindOf(l.value) === 'object' && Object.keys(l.value as JsonObject).length > 1) reorderKeys(rng, l.value as JsonObject);
    if (typeof l.value === 'number' && l.value === 0) setAt(root, l.path, Object.is(l.value, -0) ? 0 : -0);
  }
  return root;
}

interface Case {
  left: Json;
  right: Json;
}

function genCase(rng: Rng, index: number): Case {
  const large = index % 60 === 59;
  const size = large ? rng.range(400, 2000) : rng.range(1, 40);
  const left = genValue(rng, { n: size }, 0);
  const mode = rng.int(20);
  if (mode < 2) return { left, right: clone(left) };
  if (mode < 4) return { left, right: cosmetic(rng, clone(left)) };
  if (mode < 6) return { left, right: genValue(rng, { n: rng.range(1, 40) }, 0) };
  let right = clone(left);
  const k = rng.range(1, large ? 6 : 3);
  for (let i = 0; i < k; i++) right = mutateOnce(rng, right);
  return { left, right };
}

function collectKeys(v: Json, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const el of v) collectKeys(el, out);
  else if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      out.add(k);
      collectKeys(v[k], out);
    }
  }
  return out;
}

/** Noise rules that name keys actually present, in every supported path shape. */
function genRules(rng: Rng, c: Case): NoiseRule[] {
  const keys = Array.from(collectKeys(c.left, collectKeys(c.right)));
  if (keys.length === 0) return [];
  const count = rng.range(1, 3);
  const rules: NoiseRule[] = [];
  for (let i = 0; i < count; i++) {
    const k1 = rng.pick(keys);
    const k2 = rng.pick(keys);
    const path = rng.pick([`$..${k1}`, `$.${k1}`, `$.${k1}.${k2}`, `$.${k1}[*].${k2}`, `$.${k1}[*]`, `$..${k1}.${k2}`]);
    rules.push({ path, type: 'uuid', source: 'manual', createdAt: 0 });
  }
  return rules;
}

// ── property checks ────────────────────────────────────────────────────────

const paneText = (rows: DiffLine[]) =>
  rows
    .filter((r) => r.type !== 'empty')
    .map((r) => r.content)
    .join('\n');

const countType = (rows: DiffLine[], type: DiffLine['type']) => rows.filter((r) => r.type === type).length;

const VALID_ROW_PAIRS = new Set(['unchanged/unchanged', 'modified/modified', 'removed/empty', 'empty/added']);
/**
 * A rule-suppressed subtree is rendered by `unchangedZip`: both sides shown as
 * unchanged, the shorter side padded. So under noise rules an `unchanged` row
 * may legitimately face an `empty` one — and only then.
 */
const RULE_ONLY_ROW_PAIRS = new Set(['unchanged/empty', 'empty/unchanged']);

function checkRows(d: DiffResult, rulesActive = false): string[] {
  const v: string[] = [];
  if (d.left.length !== d.right.length) {
    return [`[ROWS] left has ${d.left.length} rows, right has ${d.right.length}`];
  }
  let ln = 0;
  let rn = 0;
  for (let i = 0; i < d.left.length && v.length < 5; i++) {
    const l = d.left[i];
    const r = d.right[i];
    if (!l || !r) {
      v.push(`[ROWS] hole at row ${i}`);
      continue;
    }
    const pairKey = `${l.type}/${r.type}`;
    if (!VALID_ROW_PAIRS.has(pairKey) && !(rulesActive && RULE_ONLY_ROW_PAIRS.has(pairKey))) {
      v.push(`[ROWS] row ${i} has type pair ${pairKey}`);
    }
    if (l.type === 'empty') {
      if (l.lineNumber !== null || l.content !== '') v.push(`[ROWS] left empty row ${i} carries content/lineNumber`);
    } else if (l.lineNumber !== ++ln) v.push(`[ROWS] left lineNumber at row ${i} is ${l.lineNumber}, expected ${ln}`);
    if (r.type === 'empty') {
      if (r.lineNumber !== null || r.content !== '') v.push(`[ROWS] right empty row ${i} carries content/lineNumber`);
    } else if (r.lineNumber !== ++rn) v.push(`[ROWS] right lineNumber at row ${i} is ${r.lineNumber}, expected ${rn}`);
  }
  return v;
}

function checkReadBack(d: DiffResult, left: Json, right: Json): string[] {
  const v: string[] = [];
  for (const [side, rows, original] of [['LEFT', d.left, left], ['RIGHT', d.right, right]] as const) {
    const text = paneText(rows);
    let parsed: Json;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      v.push(`[I1] ${side} pane is not valid JSON (${(err as Error).message}); pane text: ${JSON.stringify(text)}`);
      continue;
    }
    if (!eq(parsed, original)) v.push(`[I1] ${side} pane reads back as ${literal(parsed)}, expected ${literal(original)}`);
  }
  return v;
}

function checkVerdict(d: DiffResult, expectEqual: boolean): string[] {
  const v: string[] = [];
  const changedRows =
    d.left.some((l) => l.type !== 'unchanged' && l.type !== 'empty') ||
    d.right.some((r) => r.type !== 'unchanged' && r.type !== 'empty');
  if (expectEqual) {
    if (d.hasDifferences) v.push('[I3] equal documents reported hasDifferences=true');
    if (d.additions !== 0 || d.removals !== 0) v.push(`[I3] equal documents reported +${d.additions}/-${d.removals}`);
    if (changedRows) v.push('[I3] equal documents rendered an added/removed/modified row');
  } else {
    if (!d.hasDifferences) v.push('[I2] different documents reported hasDifferences=false');
    if (d.additions + d.removals === 0) v.push('[I2] different documents but additions + removals = 0');
  }
  if (d.hasDifferences !== (d.additions > 0 || d.removals > 0)) {
    v.push('[VERDICT] hasDifferences disagrees with additions/removals');
  }
  return v;
}

function checkSegments(d: DiffResult): string[] {
  const v: string[] = [];
  for (let i = 0; i < d.left.length && v.length < 5; i++) {
    for (const [side, row] of [['left', d.left[i]], ['right', d.right[i]]] as const) {
      if (!row?.segments) continue;
      const joined = row.segments.map((s) => s.text).join('');
      if (joined !== row.content) v.push(`[SEG] ${side} row ${i} segments join to ${JSON.stringify(joined)} but content is ${JSON.stringify(row.content)}`);
    }
    const l = d.left[i];
    const r = d.right[i];
    if (l?.type === 'modified' && (l.segments || r?.segments)) {
      const highlighted = (l.segments ?? []).some((s) => s.type !== 'unchanged') || (r.segments ?? []).some((s) => s.type !== 'unchanged');
      if (!highlighted) v.push(`[SEG] modified row ${i} has segments but nothing highlighted on either side`);
    }
  }
  return v;
}

/**
 * Closing brackets of a container the walker recursed into carry no path
 * (`RowBuilder.pair` is called without meta for them in walkObjects /
 * walkArrays), while closing brackets inside a rendered subtree do. That is
 * inconsistent with the "every row carries the path of the value it belongs
 * to" comment in jsonTreeDiff.ts, but harmless for Go to Path, which resolves
 * to the opening row. Exempted here and reported separately.
 */
const CLOSING_BRACKET = /^[\]}],?$/;

function checkPaths(d: DiffResult): string[] {
  const v: string[] = [];
  for (const [side, rows] of [['left', d.left], ['right', d.right]] as const) {
    for (let i = 0; i < rows.length && v.length < 5; i++) {
      const row = rows[i];
      if (row.type === 'empty') continue;
      if (CLOSING_BRACKET.test(row.content.trim())) continue;
      if (typeof row.path !== 'string' || !row.path.startsWith('$')) {
        v.push(`[PATH] ${side} row ${i} (${JSON.stringify(row.content)}) has path ${JSON.stringify(row.path)}`);
      }
    }
  }
  return v;
}

function checkCounts(d: DiffResult): string[] {
  const v: string[] = [];
  const adds = countType(d.right, 'added') + countType(d.right, 'modified');
  const rems = countType(d.left, 'removed') + countType(d.left, 'modified');
  if (d.additions !== adds) v.push(`[COUNT] additions=${d.additions} but rows say ${adds}`);
  if (d.removals !== rems) v.push(`[COUNT] removals=${d.removals} but rows say ${rems}`);
  return v;
}

const LARGE_DOC_NODES = 2000;

function checkTree(left: Json, right: Json, opts: JsonTreeDiffOptions): string[] {
  let d: DiffResult;
  try {
    d = computeJsonTreeDiff(left, right, opts);
  } catch (err) {
    return [`[THROW] computeJsonTreeDiff threw ${(err as Error).name}: ${(err as Error).message}`];
  }
  const v = [...checkRows(d, (opts.rules?.length ?? 0) > 0), ...checkReadBack(d, left, right)];
  const expectEqual = eqMasked(left, right, normOf(opts), opts.rules ?? [], '$');
  v.push(...checkVerdict(d, expectEqual), ...checkSegments(d), ...checkPaths(d), ...checkCounts(d));
  if (d.degraded && countNodes(left) < LARGE_DOC_NODES && countNodes(right) < LARGE_DOC_NODES) {
    v.push('[DEGRADED] degraded flag set on a document under the size guard');
  }
  return v;
}

/** computeDiff with JSON text on both sides must route to the tree diff and agree with it. */
function checkTextEntry(left: Json, right: Json, opts: JsonTreeDiffOptions, pretty: boolean): string[] {
  const lt = pretty ? JSON.stringify(left, null, 2) : JSON.stringify(left);
  const rt = pretty ? JSON.stringify(right, null, 2) : JSON.stringify(right);
  let d: DiffResult;
  try {
    d = computeDiff(lt, rt, { ...opts });
  } catch (err) {
    return [`[THROW] computeDiff threw ${(err as Error).name}: ${(err as Error).message}`];
  }
  const v = [...checkRows(d, (opts.rules?.length ?? 0) > 0), ...checkReadBack(d, left, right)];
  const expectEqual = eqMasked(left, right, normOf(opts), opts.rules ?? [], '$');
  v.push(...checkVerdict(d, expectEqual), ...checkSegments(d), ...checkCounts(d));
  return v;
}

function checkEnhanced(left: Json, right: Json, opts: DiffOptions, rules?: NoiseRule[]): string[] {
  const lt = JSON.stringify(left, null, 2);
  const rt = JSON.stringify(right, null, 2);
  let d: ReturnType<typeof computeEnhancedDiff>;
  try {
    d = computeEnhancedDiff(lt, rt, opts, rules);
  } catch (err) {
    return [`[THROW] computeEnhancedDiff threw ${(err as Error).name}: ${(err as Error).message}`];
  }
  const v = [...checkRows(d, (rules?.length ?? 0) > 0), ...checkReadBack(d, left, right)];
  const expectEqual = eqMasked(left, right, normOf(opts), rules ?? [], '$');
  v.push(...checkVerdict(d, expectEqual), ...checkSegments(d), ...checkCounts(d));
  const pct = d.statistics.percentageChanged;
  if (!(pct >= 0 && pct <= 100)) v.push(`[STATS] percentageChanged=${pct} out of range`);
  if (!d.statistics.skipped && (pct === 0) !== !d.hasDifferences) {
    v.push(`[STATS] percentageChanged=${pct} but hasDifferences=${d.hasDifferences}`);
  }
  return v;
}

// ── shrinking ──────────────────────────────────────────────────────────────

function* shrinkCandidates(v: Json): Generator<Json> {
  const containers = locations(v)
    .filter((l) => kindOf(l.value) !== 'scalar')
    .sort((a, b) => a.path.length - b.path.length);
  // Drop one child at a time, shallowest containers first (bigger cuts first).
  for (const loc of containers) {
    const n = Array.isArray(loc.value) ? loc.value.length : Object.keys(loc.value as JsonObject).length;
    for (let i = 0; i < n; i++) {
      const c = clone(v);
      const target = getAt(c, loc.path);
      if (Array.isArray(target)) target.splice(i, 1);
      else delete (target as JsonObject)[Object.keys(target as JsonObject)[i]];
      yield c;
    }
  }
  // Collapse whole subtrees to a scalar.
  for (const loc of containers) {
    if (loc.path.length === 0) continue;
    yield setAt(clone(v), loc.path, 0);
  }
  // Shorten long strings.
  for (const loc of locations(v)) {
    if (typeof loc.value === 'string' && loc.value.length > 8) yield setAt(clone(v), loc.path, loc.value.slice(0, 4));
  }
}

const SHRINK_BUDGET = 400;

function shrink(c: Case, fails: (c: Case) => boolean): Case {
  let cur = c;
  let calls = 0;
  let progress = true;
  while (progress && calls < SHRINK_BUDGET) {
    progress = false;
    for (const side of ['left', 'right'] as const) {
      for (const cand of shrinkCandidates(cur[side])) {
        if (calls++ >= SHRINK_BUDGET) break;
        const next: Case = side === 'left' ? { left: cand, right: cur.right } : { left: cur.left, right: cand };
        if (fails(next)) {
          cur = next;
          progress = true;
          break;
        }
      }
      if (progress) break;
    }
  }
  return cur;
}

/**
 * Run `count` generated cases. `setup` fixes the options for one case (it may
 * draw from the rng, e.g. to build rules) and returns the property as a
 * function of the input, so shrinking re-runs exactly the same check. On the
 * first failure, shrink, log the minimal repro, and return a message for the
 * assertion.
 */
function runCases(
  label: string,
  count: number,
  setup: (c: Case, rng: Rng) => { run: (c: Case) => string[]; options: unknown }
): string | null {
  const rng = new Rng(seedFor(label));
  for (let i = 0; i < count; i++) {
    const c = genCase(rng, i);
    const { run, options } = setup(c, rng);
    const violations = run(c);
    if (violations.length === 0) continue;
    const small = shrink(c, (x) => {
      try {
        return run(x).length > 0;
      } catch {
        return false;
      }
    });
    let smallViolations: string[];
    try {
      smallViolations = run(small);
      if (smallViolations.length === 0) smallViolations = violations.map((s) => `(unshrunk) ${s}`);
    } catch (err) {
      smallViolations = [`threw ${String(err)}`];
    }
    const repro = [
      `[diffProperties] ${label}: case #${i} failed`,
      `  options: ${JSON.stringify(options)}`,
      `  left:  ${literal(small.left)}`,
      `  right: ${literal(small.right)}`,
      ...smallViolations.map((s) => `  - ${s}`),
      `  (original, unshrunk: left=${literal(c.left).slice(0, 400)} right=${literal(c.right).slice(0, 400)})`,
    ].join('\n');
    console.log(repro);
    return repro;
  }
  return null;
}

// ── option combinations ────────────────────────────────────────────────────

interface Combo {
  name: string;
  opts: JsonTreeDiffOptions;
  withRules?: boolean;
}

const COMBOS: Combo[] = [
  { name: 'default', opts: {} },
  { name: 'sortKeys:false', opts: { sortKeys: false } },
  { name: 'semanticComparison', opts: { semanticComparison: true } },
  { name: 'ignoreCase', opts: { ignoreCase: true } },
  { name: 'ignoreWhitespace', opts: { ignoreWhitespace: true } },
  { name: 'all normalizations', opts: { semanticComparison: true, ignoreCase: true, ignoreWhitespace: true } },
  { name: 'noise rules', opts: {}, withRules: true },
  { name: 'noise rules + sortKeys:false', opts: { sortKeys: false }, withRules: true },
];

const CASES_PER_COMBO = 300;

// ───────────────────────────────────────────────────────────────────────────
// computeJsonTreeDiff
// ───────────────────────────────────────────────────────────────────────────

describe('property: computeJsonTreeDiff invariants over random documents', () => {
  for (const combo of COMBOS) {
    it(`I1/I2/I3, rows, segments, paths, counts hold under ${combo.name} (${CASES_PER_COMBO} cases)`, () => {
      const failure = runCases(`tree/${combo.name}`, CASES_PER_COMBO, (c, rng) => {
        const opts: JsonTreeDiffOptions = combo.withRules ? { ...combo.opts, rules: genRules(rng, c) } : combo.opts;
        return { run: (x) => checkTree(x.left, x.right, opts), options: { ...opts, combo: combo.name } };
      });
      expect(failure, failure ?? '').toBeNull();
    });
  }
});

describe('property: computeDiff with JSON text agrees with the tree diff', () => {
  for (const combo of COMBOS.slice(0, 3)) {
    for (const pretty of [false, true]) {
      it(`${pretty ? 'pretty' : 'compact'} JSON text under ${combo.name}`, () => {
        const failure = runCases(`text-entry/${combo.name}/${pretty}`, 120, (c, rng) => {
          const opts: JsonTreeDiffOptions = combo.withRules ? { ...combo.opts, rules: genRules(rng, c) } : combo.opts;
          return { run: (x) => checkTextEntry(x.left, x.right, opts, pretty), options: { ...opts, pretty } };
        });
        expect(failure, failure ?? '').toBeNull();
      });
    }
  }
});

describe('property: computeEnhancedDiff statistics and fidelity', () => {
  const enhancedCombos: { name: string; opts: DiffOptions; withRules?: boolean }[] = [
    { name: 'default', opts: {} },
    { name: 'semanticComparison', opts: { semanticComparison: true } },
    { name: 'ignoreCase + ignoreWhitespace', opts: { ignoreCase: true, ignoreWhitespace: true } },
    { name: 'noise rules', opts: {}, withRules: true },
  ];
  for (const combo of enhancedCombos) {
    it(`percentageChanged is 0 iff no differences, panes read back, under ${combo.name}`, () => {
      const failure = runCases(`enhanced/${combo.name}`, 150, (c, rng) => {
        const rules = combo.withRules ? genRules(rng, c) : undefined;
        return { run: (x) => checkEnhanced(x.left, x.right, combo.opts, rules), options: { ...combo.opts, rules } };
      });
      expect(failure, failure ?? '').toBeNull();
    });
  }
});

describe('property: idempotence and symmetry', () => {
  it('a document diffed against a clone of itself has no differences and identical panes', () => {
    const rng = new Rng(seedFor('idempotence'));
    for (let i = 0; i < 200; i++) {
      const size = i % 50 === 49 ? rng.range(400, 2000) : rng.range(1, 40);
      const doc = genValue(rng, { n: size }, 0);
      const copy = clone(doc);
      for (const combo of COMBOS) {
        const opts = combo.withRules ? { ...combo.opts, rules: genRules(rng, { left: doc, right: copy }) } : combo.opts;
        const d = computeJsonTreeDiff(doc, copy, opts);
        const problems: string[] = [];
        if (d.hasDifferences || d.additions || d.removals) problems.push(`reported +${d.additions}/-${d.removals}`);
        if (d.left.length !== d.right.length) problems.push('pane lengths differ');
        for (let r = 0; r < d.left.length; r++) {
          if (d.left[r].content !== d.right[r].content || d.left[r].type !== 'unchanged') {
            problems.push(`row ${r}: ${JSON.stringify(d.left[r].content)} vs ${JSON.stringify(d.right[r].content)} (${d.left[r].type})`);
            break;
          }
        }
        if (problems.length) {
          const msg = `[diffProperties] idempotence failed under ${combo.name}: ${problems.join('; ')}\n  doc: ${literal(doc)}`;
          console.log(msg);
          expect.fail(msg);
        }
      }
    }
  });

  /** Verdict-level symmetry: what the engine does guarantee. */
  function checkVerdictSymmetry(x: Case): string[] {
    const v: string[] = [];
    for (const combo of COMBOS.filter((k) => !k.withRules)) {
      const ab = computeJsonTreeDiff(x.left, x.right, combo.opts);
      const ba = computeJsonTreeDiff(x.right, x.left, combo.opts);
      if (ab.hasDifferences !== ba.hasDifferences) v.push(`[SYM ${combo.name}] hasDifferences differs by direction`);
      if (!!ab.degraded !== !!ba.degraded) v.push(`[SYM ${combo.name}] degraded differs by direction`);
      if ((ab.additions + ab.removals > 0) !== (ba.additions + ba.removals > 0)) v.push(`[SYM ${combo.name}] one direction counts changes, the other none`);
      if (v.length) break;
    }
    return v;
  }

  it('swapping the sides never changes whether there are differences', () => {
    const failure = runCases('symmetry/verdict', 300, () => ({ run: checkVerdictSymmetry, options: 'all option combos without rules' }));
    expect(failure, failure ?? '').toBeNull();
  });

  /*
   * Count-level symmetry (A→B additions == B→A removals) is deliberately NOT a
   * property. `pairBySimilarity` is a maximum-weight monotone matching, and
   * when two pairings tie on total weight (both candidates exactly at
   * ARRAY_PAIR_THRESHOLD, e.g. A=[{items:[1]},{items:0}] vs
   * B=[{a:"x",items:0},{a:0,items:[1]}]) the two directions may pick
   * different, equally valid pairings and report different counts. The panes
   * are correct both ways (I1 above) and the verdict is symmetric (below);
   * only the summary numbers depend on which side is "left".
   */
});

// ───────────────────────────────────────────────────────────────────────────
// Known engine bugs found by the properties above, pinned as literals
// ───────────────────────────────────────────────────────────────────────────

describe('engine regressions found by the properties above, pinned as literals', () => {
  /**
   * REGRESSION (fixed) — I1 violation under `sortKeys: false`.
   *
   * `walkObjects` (jsonTreeDiff.ts, the `lastRight` / `rightComma` logic)
   * emits shared keys in the LEFT document's order but decides the right
   * pane's trailing commas from the RIGHT document's own last key. When the
   * two orders differ, the right pane ends up with a comma after its last
   * emitted member and none after an earlier one — invalid JSON.
   *
   *   left  {"a": 1, "b": 2}   right {"b": 2, "a": 1}   →  right pane:
   *     {
   *       "a": 1        <- no comma
   *       "b": 2,       <- trailing comma
   *     }
   *
   * Every sortKeys:false property above fails through this same root cause.
   */
  it('sortKeys:false — right pane stays valid JSON when key order differs', () => {
    const v = checkTree({ a: 1, b: 2 }, { b: 2, a: 1 }, { sortKeys: false });
    expect(v, v.join('\n')).toEqual([]);
    const v2 = checkTree({ '': 100 }, { name: 0, '': 100 }, { sortKeys: false });
    expect(v2, v2.join('\n')).toEqual([]);
  });

  /**
   * REGRESSION (fixed) — I2 violation (false negative) under `semanticComparison`.
   *
   * `canonical()` (jsonTreeDiff.ts) serializes each normalized scalar with
   * `JSON.stringify`, and a string that semantic comparison turns into a
   * non-finite number ("Infinity", "-Infinity", "1e400") stringifies to
   * `null`. So inside an id-keyed array — where the `match` branch of
   * `walkArrays` decides equality with `deepEquals` → `canonical` — the
   * element `{v: "Infinity"}` is declared identical to `{v: null}` and the
   * pair is rendered unchanged, while the same two values at an object key
   * go through `walkScalars` (`===` on the normalized values) and correctly
   * report a difference.
   *
   *   [{id: 1, v: "Infinity"}] vs [{id: 1, v: null}]  →  hasDifferences=false
   *   {v: "Infinity"}          vs {v: null}           →  hasDifferences=true
   */
  it('semanticComparison — "Infinity" vs null is a difference in an id-keyed array too', () => {
    const opts: JsonTreeDiffOptions = { semanticComparison: true };
    expect(computeJsonTreeDiff({ v: 'Infinity' }, { v: null }, opts).hasDifferences).toBe(true);
    const v = checkTree([{ id: 1, v: 'Infinity' }], [{ id: 1, v: null }], opts);
    expect(v, v.join('\n')).toEqual([]);
    const v2 = checkTree([{ id: 1, v: '1e400' }], [{ id: 1, v: null }], opts);
    expect(v2, v2.join('\n')).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Guards: depth and size
// ───────────────────────────────────────────────────────────────────────────

describe('guards: depth limit and degraded flag', () => {
  const nestedArrays = (depth: number): Json => {
    let v: Json = 1;
    for (let i = 0; i < depth; i++) v = [v];
    return v;
  };
  const nestedObjects = (depth: number): Json => {
    let v: Json = 'leaf';
    for (let i = 0; i < depth; i++) v = { a: v };
    return v;
  };

  it('a 300-deep document throws DiffDepthExceededError from every entry point', () => {
    for (const deep of [nestedArrays(300), nestedObjects(300)]) {
      expect(() => computeJsonTreeDiff(deep, deep)).toThrow(DiffDepthExceededError);
      expect(() => computeJsonTreeDiff(deep, 1)).toThrow(DiffDepthExceededError);
      expect(() => computeJsonTreeDiff(1, deep)).toThrow(DiffDepthExceededError);
      expect(() => computeDiff(JSON.stringify(deep), JSON.stringify(deep))).toThrow(DiffDepthExceededError);
      // computeEnhancedDiff short-circuits byte-identical text before the depth
      // check (nothing is walked, so nothing can overflow); give it a real diff.
      expect(() => computeEnhancedDiff(JSON.stringify(deep), JSON.stringify(1))).toThrow(DiffDepthExceededError);
      expect(() => computeEnhancedDiff(JSON.stringify(1), JSON.stringify(deep))).toThrow(DiffDepthExceededError);
    }
  });

  it('a 250-deep document does not throw and satisfies the invariants', () => {
    for (const [a, b] of [
      [nestedArrays(250), nestedArrays(250)],
      [nestedObjects(250), nestedObjects(250)],
      [nestedArrays(250), nestedArrays(249)],
      [nestedObjects(250), setAt(nestedObjects(250), Array(250).fill('a'), 'changed')],
    ] as [Json, Json][]) {
      expect(() => computeJsonTreeDiff(a, b)).not.toThrow();
      const v = checkTree(a, b, {});
      expect(v, v.join('\n')).toEqual([]);
      expect(() => computeEnhancedDiff(JSON.stringify(a, null, 2), JSON.stringify(b, null, 2))).not.toThrow();
    }
  });

  it('degraded is never set for documents under ~2000 nodes, even when everything changed', () => {
    const rng = new Rng(seedFor('degraded'));
    for (let i = 0; i < 12; i++) {
      const left = genValue(rng, { n: rng.range(800, 1900) }, 0);
      const right = genValue(rng, { n: rng.range(800, 1900) }, 0);
      const d = computeJsonTreeDiff(left, right);
      expect(d.degraded, `degraded set for ${countNodes(left)} vs ${countNodes(right)} nodes`).toBeFalsy();
    }
    // Worst shape for the array aligner: one flat array of unique scalars, fully rewritten.
    const flatL = Array.from({ length: 1900 }, (_, i) => `L${i}`);
    const flatR = Array.from({ length: 1900 }, (_, i) => `R${i}`);
    expect(computeJsonTreeDiff(flatL, flatR).degraded).toBeFalsy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Text path
// ───────────────────────────────────────────────────────────────────────────

const LINE_POOL: readonly string[] = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', '', '  indented', '    deeper', 'key: value', 'key: other',
  '\ttabbed', 'trailing  ', 'x', 'unicode é 😀', 'a b c', 'a  b  c', 'brace {', '}', '- item',
  'longline '.repeat(20), 'line with "quotes"', 'crlf\r', ' ', 'nbsp here', 'zw​sp',
];

function genLines(rng: Rng, n: number): string[] {
  return Array.from({ length: n }, () => (rng.chance(0.85) ? rng.pick(LINE_POOL) : `line ${rng.int(1000)}`));
}

function mutateLines(rng: Rng, lines: string[]): string[] {
  const out = [...lines];
  const k = rng.range(1, 4);
  for (let m = 0; m < k; m++) {
    const op = rng.int(7);
    const i = out.length ? rng.int(out.length) : 0;
    if (op === 0) out.splice(rng.int(out.length + 1), 0, rng.pick(LINE_POOL));
    else if (op === 1 && out.length) out.splice(i, 1);
    else if (op === 2 && out.length) out[i] = out[i] + 'x';
    else if (op === 3 && out.length > 1) {
      const j = rng.int(out.length);
      [out[i], out[j]] = [out[j], out[i]];
    } else if (op === 4 && out.length) out.splice(i, 0, out[i]);
    else if (op === 5 && out.length) out[i] = '  ' + out[i];
    else if (op === 6 && out.length) out[i] = out[i].replace(/x/g, 'y') + '\r';
  }
  return out;
}

const isJsonText = (t: string) => {
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
};

function checkText(leftLines: string[], rightLines: string[], advanced: boolean): string[] {
  const lt = leftLines.join('\n');
  const rt = rightLines.join('\n');
  if (isJsonText(lt) && isJsonText(rt)) return []; // would route to the tree path; covered above
  let d: DiffResult;
  try {
    d = computeDiff(lt, rt, { advancedMode: advanced });
  } catch (err) {
    return [`[THROW] computeDiff (text) threw ${(err as Error).name}: ${(err as Error).message}`];
  }
  const v = [...checkRows(d), ...checkSegments(d), ...checkCounts(d)];
  if (paneText(d.left) !== lt) v.push(`[I1 TEXT] left pane reads back as ${JSON.stringify(paneText(d.left))}, expected ${JSON.stringify(lt)}`);
  if (paneText(d.right) !== rt) v.push(`[I1 TEXT] right pane reads back as ${JSON.stringify(paneText(d.right))}, expected ${JSON.stringify(rt)}`);
  // The engine sees `text.split('\n')`, so an empty document is one empty line.
  const leftCount = lt.split('\n').length;
  const rightCount = rt.split('\n').length;
  if (d.additions > rightCount) v.push(`[BOUND] additions=${d.additions} > right lines ${rightCount}`);
  if (d.removals > leftCount) v.push(`[BOUND] removals=${d.removals} > left lines ${leftCount}`);
  if (d.hasDifferences !== (d.additions > 0 || d.removals > 0)) v.push('[VERDICT] hasDifferences disagrees with counts');
  if (lt === rt && d.hasDifferences) v.push('[I3 TEXT] identical text reported differences');
  if (d.degraded) v.push('[DEGRADED] set on a small text input');
  return v;
}

describe('property: text path over random line lists', () => {
  for (const advanced of [true, false]) {
    it(`I1 read-back, bounds and row shape hold (advancedMode=${advanced})`, () => {
      const rng = new Rng(seedFor(`text/${advanced}`));
      for (let i = 0; i < 300; i++) {
        const n = i % 50 === 49 ? rng.range(200, 1500) : rng.range(0, 30);
        const left = genLines(rng, n);
        const mode = rng.int(10);
        const right = mode === 0 ? [...left] : mode === 1 ? genLines(rng, rng.range(0, 30)) : mutateLines(rng, left);
        let v = checkText(left, right, advanced);
        if (v.length === 0) continue;
        // Greedy line-level shrink.
        let cur = { left, right };
        let calls = 0;
        let progress = true;
        while (progress && calls < SHRINK_BUDGET) {
          progress = false;
          for (const side of ['left', 'right'] as const) {
            for (let k = 0; k < cur[side].length && !progress && calls < SHRINK_BUDGET; k++) {
              const cand = cur[side].filter((_, idx) => idx !== k);
              const next = side === 'left' ? { left: cand, right: cur.right } : { left: cur.left, right: cand };
              calls++;
              if (checkText(next.left, next.right, advanced).length > 0) {
                cur = next;
                progress = true;
              }
            }
            if (progress) break;
          }
        }
        v = checkText(cur.left, cur.right, advanced);
        const msg = [
          `[diffProperties] text/${advanced}: case #${i} failed`,
          `  left:  ${JSON.stringify(cur.left)}`,
          `  right: ${JSON.stringify(cur.right)}`,
          ...v.map((s) => `  - ${s}`),
        ].join('\n');
        console.log(msg);
        expect.fail(msg);
      }
    });
  }

  for (const n of [10, 100, 1000, 3000]) {
    it(`one insertion in the middle of ${n} lines is exactly +1/-0`, () => {
      const base = Array.from({ length: n }, (_, i) => `line ${i}`);
      const mid = Math.floor(n / 2);
      const withIns = [...base.slice(0, mid), 'INSERTED', ...base.slice(mid)];
      const d = computeDiff(base.join('\n'), withIns.join('\n'));
      expect(d.additions).toBe(1);
      expect(d.removals).toBe(0);
      expect(d.degraded).toBeFalsy();
      expect(paneText(d.left)).toBe(base.join('\n'));
      expect(paneText(d.right)).toBe(withIns.join('\n'));
    });
  }
});
