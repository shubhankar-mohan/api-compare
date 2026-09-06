/**
 * Structural diff over parsed JSON.
 *
 * The previous JSON path re-serialized both sides and then tried to match the
 * resulting *text* line by line. That made rendering artifacts semantically
 * significant — trailing commas, key order and indent width all produced
 * phantom differences — and the line matcher could not represent an insertion,
 * so added lines were counted but dropped from the rendered pane.
 *
 * This module compares the parsed values instead and *derives* the rendering
 * from the comparison. Consequences:
 *
 * - Object members are matched by key name, so key order never diffs.
 * - Array elements are matched by a stable id when one exists, otherwise by
 *   an LCS over their canonical form, so an inserted element shifts nothing.
 * - Commas are computed per side at render time and never affect a row's type.
 * - Every emitted row carries both sides, so a pane can always be read back
 *   as the document it represents (see `diffCorrectness.test.ts`, I1).
 *
 * Noise rules are applied here, before comparison, so a suppressed field is
 * genuinely not a difference — it does not count toward additions/removals and
 * does not set `hasDifferences`. Previously rules only lowered a row's opacity.
 */

import type { DiffLine, DiffResult, DiffSegment, NoiseAnnotation } from './diffTypes';
import { computeScalarRowSegments } from './inlineSegments';
import { alignSequences, type AlignOp } from './sequenceAlign';
import { isValidRulePath, ruleMatchesPath, type NoiseRule } from './noiseRules';
import { CLASSIFIERS, detectFieldType, getClassifier, type NoiseClassifier } from './smartComparison';

export interface JsonTreeDiffOptions {
  /** Saved noise rules. A matching path is rendered greyed and not counted. */
  rules?: NoiseRule[];
  /**
   * Paths from the Diff Options panel ("ignore key" → `$..key`, "ignore
   * path" → the path). Applied exactly like rules — rendered, greyed, not
   * counted, masked for array identity — and labelled `source: 'option'`.
   * They used to delete the members from the document before diffing, so
   * the panes stopped reading back as the response and the merge dropped
   * every ignored key.
   */
  ignoredPaths?: string[];
  /**
   * Legacy heuristic suppression of id-shaped and timestamp-shaped values.
   *
   * This used to be unconditional, and it was the entire false-negative
   * surface of the tool: `detectFieldType` matches the *substring* "id", so
   * `provider`, `paid` and `candidate` were treated as identifiers, and the
   * value pattern `/"[0-9a-f-]+"/` accepts any hex-ish string. That silently
   * hid real changes to `orderId`, `accountId`, `token`, `updated_at` and
   * `expiryDate`. It is now opt-in and defaults to off.
   */
  legacyAutoIgnore?: boolean;
  /**
   * Render object keys in sorted order on both sides. JSON objects are
   * unordered, so this removes a whole class of false positives when the two
   * environments use different serializers. Off means "render in the left
   * side's order (right-only keys appended)"; members are still matched by
   * name, so a pure reorder is not reported as a change either way.
   */
  sortKeys?: boolean;
  /** Compute inline (sub-line) highlight segments for changed scalars. */
  inlineSegments?: boolean;
  /** Treat "5" and 5 (and "true"/true, "null"/null) as equal. */
  semanticComparison?: boolean;
  /** Compare strings case-insensitively. */
  ignoreCase?: boolean;
  /** Collapse runs of whitespace in strings before comparing. */
  ignoreWhitespace?: boolean;
}

/**
 * How scalars are normalized before comparison.
 *
 * These are the three switches the Diff Options panel offers. They used to be
 * read only by `deepEqual`, which feeds statistics — so the panel changed the
 * numbers while the rendered panes ignored it, and the two halves of the UI
 * disagreed. Normalization affects comparison only; rendering always shows the
 * value the server actually sent.
 */
interface ScalarNormalization {
  semanticComparison: boolean;
  ignoreCase: boolean;
  ignoreWhitespace: boolean;
}

/**
 * A JSON-style decimal literal, optionally surrounded by whitespace. `Number()`
 * alone also accepted `"0x1A"`, `"+1"` and `"Infinity"`, so semantic
 * comparison folded hex to 26 and — because `JSON.stringify(Infinity)` is
 * `null` — made `"Infinity"` equal to a real `null` inside array identity.
 */
const DECIMAL_LITERAL = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

function normalizeScalar(value: unknown, n: ScalarNormalization): unknown {
  let out = value;

  if (n.semanticComparison && typeof out === 'string') {
    const trimmed = out.trim();
    if (DECIMAL_LITERAL.test(trimmed) && Number.isFinite(Number(trimmed))) out = Number(trimmed);
    else if (trimmed === 'true') out = true;
    else if (trimmed === 'false') out = false;
    else if (trimmed === 'null') out = null;
  }

  if (typeof out === 'string') {
    if (n.ignoreWhitespace) out = out.replace(/\s+/g, ' ').trim();
    if (n.ignoreCase) out = out.toLowerCase();
  }

  return out;
}

/**
 * Deepest JSON nesting this module will walk.
 *
 * The walk is recursive, so a sufficiently nested document overflows the call
 * stack. That used to surface as an uncaught `RangeError` thrown from inside a
 * React `useMemo` during render — i.e. a blank page. 256 is far deeper than any
 * real API response and leaves ample stack headroom; anything beyond it is
 * pathological and gets a typed error the UI can explain.
 */
export const MAX_TREE_DEPTH = 256;

/** Thrown when a document nests deeper than `MAX_TREE_DEPTH`. */
export class DiffDepthExceededError extends Error {
  readonly depth: number;
  constructor(depth: number) {
    super(
      `This response nests more than ${MAX_TREE_DEPTH} levels deep, which is too deep to diff safely.`
    );
    this.name = 'DiffDepthExceededError';
    this.depth = depth;
  }
}

/**
 * Maximum nesting depth of a parsed value, measured iteratively.
 *
 * Deliberately not recursive: the whole point is to answer "is this too deep to
 * recurse over?" without itself overflowing the stack. Bails out early once the
 * limit is passed rather than measuring the true depth of a pathological input.
 */
export function jsonDepth(value: unknown, limit = MAX_TREE_DEPTH): number {
  let max = 0;
  const stack: Array<{ v: unknown; d: number }> = [{ v: value, d: 1 }];
  while (stack.length > 0) {
    const { v, d } = stack.pop()!;
    if (d > max) max = d;
    if (d > limit) return d;
    if (Array.isArray(v)) {
      for (const el of v) stack.push({ v: el, d: d + 1 });
    } else if (v !== null && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      for (const k of Object.keys(obj)) stack.push({ v: obj[k], d: d + 1 });
    }
  }
  return max;
}

/** Throws `DiffDepthExceededError` if the value is too deep to walk safely. */
export function assertDepthWithinLimit(value: unknown): void {
  const depth = jsonDepth(value);
  if (depth > MAX_TREE_DEPTH) throw new DiffDepthExceededError(depth);
}

/** Rows above this count skip inline segment computation to stay responsive. */
const INLINE_SEGMENT_MAX_ROWS = 6000;
/**
 * Cell budget for array alignment, matching the text path.
 *
 * Was a flat 1200-element cap, which inverted the same way: prepending one
 * element to a 1199-element array cost +1/-0, and to a 1200-element array cost
 * +1201/-1200 — the entire list reported as rewritten. The budget now applies
 * only to the part left after the common prefix and suffix are trimmed (see
 * `sequenceAlign.ts`), and exceeding it sets `degraded` on the result.
 */
const MAX_ARRAY_LCS_CELLS = 16_000_000;

/** Fields tried, in order, when looking for a stable identity in an array. */
const ID_KEY_CANDIDATES = ['id', '_id', 'uuid', 'key', 'sku', 'code', 'slug', 'name'] as const;

type Kind = 'object' | 'array' | 'scalar';

function kindOf(v: unknown): Kind {
  if (Array.isArray(v)) return 'array';
  if (v !== null && typeof v === 'object') return 'object';
  return 'scalar';
}

const pad = (depth: number) => '  '.repeat(depth);

/** No-op normalization: compare values exactly as sent. */
const EXACT: ScalarNormalization = { semanticComparison: false, ignoreCase: false, ignoreWhitespace: false };

/**
 * Deterministic serialization, used for equality checks.
 *
 * Scalars go through `normalizeScalar` so that the Diff Options apply to
 * array elements exactly as they apply to object fields. They used to apply
 * only in `walkScalars`, so with semantic comparison on `{a:"1"}` vs `{a:1}`
 * was equal while `["1"]` vs `[1]` rendered as a removal plus an addition.
 */
function canonical(value: unknown, n: ScalarNormalization = EXACT): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(normalizeScalar(value, n)) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map((el) => canonical(el, n)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k], n)}`)
    .join(',')}}`;
}

const NOISE_PLACEHOLDER = '" noise"';

/** Rules synthesised from `ignoredPaths`; they render as `source: 'option'`. */
const OPTION_RULES = new WeakSet<NoiseRule>();

function noiseFor(rule: NoiseRule): NoiseAnnotation {
  return OPTION_RULES.has(rule)
    ? { type: 'ignored', source: 'option' }
    : { type: rule.type, source: 'rule' };
}

/**
 * Canonical form with rule-suppressed paths collapsed to a placeholder.
 *
 * Used for array-element identity. Without the masking, elements whose only
 * difference is a field the user already declared to be noise would look like
 * two unrelated elements, and the whole array would align as
 * remove-everything / add-everything.
 */
function canonicalMasked(
  value: unknown,
  path: string,
  rules: NoiseRule[] | undefined,
  n: ScalarNormalization
): string {
  if (rules && rules.length && matchingRule(rules, path)) return NOISE_PLACEHOLDER;
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(normalizeScalar(value, n)) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((el, i) => canonicalMasked(el, `${path}[${i}]`, rules, n)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalMasked(obj[k], `${path}.${k}`, rules, n)}`)
    .join(',')}}`;
}

function deepEquals(a: unknown, b: unknown, n: ScalarNormalization = EXACT): boolean {
  if (a === b) return true;
  const ka = kindOf(a);
  if (ka !== kindOf(b)) return false;
  if (ka === 'scalar') return normalizeScalar(a, n) === normalizeScalar(b, n);
  return canonical(a, n) === canonical(b, n);
}

// ── rendering ──────────────────────────────────────────────────────────────

interface RenderCtx {
  depth: number;
  /** Object key this value sits under, or null for array elements / the root. */
  key: string | null;
  comma: boolean;
  /** JSONPath of this value; every emitted line is labelled with the path of the value it belongs to. */
  path: string;
}

/** Rendered lines plus, in parallel, the JSONPath each line belongs to. */
interface Rendered {
  lines: string[];
  paths: string[];
}

function head(key: string | null): string {
  return key === null ? '' : `${JSON.stringify(key)}: `;
}

/** Render one value to the exact lines `JSON.stringify(v, null, 2)` would produce. */
function renderLines(
  value: unknown,
  ctx: RenderCtx,
  sortKeys: boolean,
  out: string[] = [],
  paths: string[] = []
): string[] {
  if (ctx.depth > MAX_TREE_DEPTH) throw new DiffDepthExceededError(ctx.depth);
  const p = pad(ctx.depth);
  const h = head(ctx.key);
  const tail = ctx.comma ? ',' : '';
  const kind = kindOf(value);
  const emit = (line: string) => {
    out.push(line);
    paths.push(ctx.path);
  };

  if (kind === 'scalar') {
    emit(`${p}${h}${JSON.stringify(value)}${tail}`);
    return out;
  }

  if (kind === 'array') {
    const arr = value as unknown[];
    if (arr.length === 0) {
      emit(`${p}${h}[]${tail}`);
      return out;
    }
    emit(`${p}${h}[`);
    arr.forEach((el, i) =>
      renderLines(
        el,
        { depth: ctx.depth + 1, key: null, comma: i < arr.length - 1, path: `${ctx.path}[${i}]` },
        sortKeys,
        out,
        paths
      )
    );
    emit(`${p}]${tail}`);
    return out;
  }

  const obj = value as Record<string, unknown>;
  const keys = sortKeys ? Object.keys(obj).sort() : Object.keys(obj);
  if (keys.length === 0) {
    emit(`${p}${h}{}${tail}`);
    return out;
  }
  emit(`${p}${h}{`);
  keys.forEach((k, i) =>
    renderLines(
      obj[k],
      { depth: ctx.depth + 1, key: k, comma: i < keys.length - 1, path: `${ctx.path}.${k}` },
      sortKeys,
      out,
      paths
    )
  );
  emit(`${p}}${tail}`);
  return out;
}

// ── row accumulation ───────────────────────────────────────────────────────

/** Out-of-band per-row metadata. Never serialized into `content`. */
interface RowMeta {
  noise?: NoiseAnnotation;
  fieldKey?: string | null;
  path?: string;
}

/** First row of a group gets the group's metadata; every row gets its own path. */
function groupRowMeta(i: number, path: string, meta?: RowMeta): RowMeta {
  return i === 0 ? { ...meta, path } : { path };
}

class RowBuilder {
  left: DiffLine[] = [];
  right: DiffLine[] = [];
  additions = 0;
  removals = 0;
  private leftNo = 0;
  private rightNo = 0;

  private pushLeft(
    content: string,
    type: DiffLine['type'],
    segments?: DiffSegment[],
    meta?: RowMeta
  ) {
    this.left.push({ content, type, lineNumber: ++this.leftNo, segments, ...meta });
  }
  private pushRight(
    content: string,
    type: DiffLine['type'],
    segments?: DiffSegment[],
    meta?: RowMeta
  ) {
    this.right.push({ content, type, lineNumber: ++this.rightNo, segments, ...meta });
  }
  private padLeft() {
    this.left.push({ content: '', type: 'empty', lineNumber: null });
  }
  private padRight() {
    this.right.push({ content: '', type: 'empty', lineNumber: null });
  }

  /**
   * A row present on both sides. `changed` decides the type; structural rows
   * (braces, comma-only differences) pass `changed: false` so a comma flip can
   * never be reported as an edit.
   */
  pair(
    leftText: string,
    rightText: string,
    changed: boolean,
    segments?: { leftSegments: DiffSegment[]; rightSegments: DiffSegment[] },
    meta?: RowMeta,
    rightMeta?: RowMeta
  ) {
    if (!changed) {
      this.pushLeft(leftText, 'unchanged', undefined, meta);
      this.pushRight(rightText, 'unchanged', undefined, rightMeta ?? meta);
      return;
    }
    this.pushLeft(leftText, 'modified', segments?.leftSegments, meta);
    this.pushRight(rightText, 'modified', segments?.rightSegments, rightMeta ?? meta);
    this.removals++;
    this.additions++;
  }

  /**
   * Metadata applies to the first row of a group — the one naming the field.
   * Every row carries the path of the value it belongs to.
   */
  removed(r: Rendered, meta?: RowMeta) {
    r.lines.forEach((line, i) => {
      this.pushLeft(line, 'removed', undefined, groupRowMeta(i, r.paths[i], meta));
      this.padRight();
      this.removals++;
    });
  }

  added(r: Rendered, meta?: RowMeta) {
    r.lines.forEach((line, i) => {
      this.padLeft();
      this.pushRight(line, 'added', undefined, groupRowMeta(i, r.paths[i], meta));
      this.additions++;
    });
  }

  /** Both sides present but explicitly not a difference (suppressed subtree). */
  unchangedZip(left: Rendered, right: Rendered, meta?: RowMeta) {
    const n = Math.max(left.lines.length, right.lines.length);
    for (let i = 0; i < n; i++) {
      if (i < left.lines.length) {
        this.pushLeft(left.lines[i], 'unchanged', undefined, groupRowMeta(i, left.paths[i], meta));
      } else this.padLeft();
      if (i < right.lines.length) {
        this.pushRight(right.lines[i], 'unchanged', undefined, groupRowMeta(i, right.paths[i], meta));
      } else this.padRight();
    }
  }

  result(): DiffResult {
    return {
      left: this.left,
      right: this.right,
      additions: this.additions,
      removals: this.removals,
      hasDifferences: this.additions > 0 || this.removals > 0,
    };
  }
}

// ── array alignment ────────────────────────────────────────────────────────

/**
 * Minimum structural similarity for two unmatched array elements to be treated
 * as one edited record rather than a delete plus an insert.
 */
const ARRAY_PAIR_THRESHOLD = 0.5;

/**
 * Fraction of an element's structure that is unchanged, in [0,1].
 *
 * Element identity is a heuristic: `ID_KEY_CANDIDATES` misses `user_id`, and
 * when the id field is itself what changed (`name`, `sku`, `code`) it cannot
 * help by definition. Without a fallback, editing one field of a record emitted
 * the whole record as a removal followed by the whole record as an addition —
 * a 57-line order became 114 stacked rows with no inline highlight. The text
 * path has had this fallback all along (MODIFIED_PAIR_THRESHOLD).
 */
function elementSimilarity(a: unknown, b: unknown, n: ScalarNormalization): number {
  const ka = kindOf(a);
  if (ka !== kindOf(b)) return 0;

  if (ka === 'scalar') return deepEquals(a, b, n) ? 1 : 0;

  if (ka === 'array') {
    const aa = a as unknown[];
    const bb = b as unknown[];
    const span = Math.max(aa.length, bb.length);
    if (span === 0) return 1;
    let same = 0;
    for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
      if (deepEquals(aa[i], bb[i], n)) same++;
    }
    return same / span;
  }

  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(oa), ...Object.keys(ob)]);
  if (keys.size === 0) return 1;
  let same = 0;
  for (const key of keys) {
    if (key in oa && key in ob && deepEquals(oa[key], ob[key], n)) same++;
  }
  return same / keys.size;
}

/** An alignment op, plus the "edited in place" case the LCS cannot express. */
type PairedOp = AlignOp | { op: 'pair'; i: number; j: number };

/**
 * Largest delete/insert run that is paired by similarity. Beyond it the run
 * is paired positionally, as the similarity matrix alone is O(dels x adds)
 * element comparisons.
 */
const MAX_PAIRING_RUN = 128;

/**
 * Fold a run of deletions immediately followed by a run of insertions into
 * in-place edits where the elements are recognisably the same record.
 *
 * Pairing is a maximum-weight *monotone* matching over element similarity,
 * not a positional zip: with `[A, B]` vs `[B', C]` the zip paired A with B'
 * and B with C, both below the threshold, so the one-field edit to B rendered
 * as four whole records. Monotone matters: a pairing that crossed would emit
 * the right pane out of its own order, and each pane must read back as the
 * document it represents (I1). A swap therefore still shows one side of it
 * as a removal plus an insertion — that is what a swap looks like in order.
 */
function pairAdjacentEdits(
  ops: AlignOp[],
  l: unknown[],
  r: unknown[],
  n: ScalarNormalization
): PairedOp[] {
  const out: PairedOp[] = [];
  let k = 0;

  while (k < ops.length) {
    if (ops[k].op === 'match') {
      out.push(ops[k]);
      k++;
      continue;
    }

    const dels: number[] = [];
    const adds: number[] = [];
    while (k < ops.length && ops[k].op === 'del') dels.push((ops[k++] as { i: number }).i);
    while (k < ops.length && ops[k].op === 'add') adds.push((ops[k++] as { j: number }).j);

    if (dels.length > MAX_PAIRING_RUN || adds.length > MAX_PAIRING_RUN) {
      pairPositionally(dels, adds, l, r, n, out);
    } else {
      pairBySimilarity(dels, adds, l, r, n, out);
    }
  }

  return out;
}

function pairPositionally(
  dels: number[],
  adds: number[],
  l: unknown[],
  r: unknown[],
  n: ScalarNormalization,
  out: PairedOp[]
): void {
  const candidates = Math.min(dels.length, adds.length);
  let p = 0;
  for (; p < candidates; p++) {
    if (elementSimilarity(l[dels[p]], r[adds[p]], n) >= ARRAY_PAIR_THRESHOLD) {
      out.push({ op: 'pair', i: dels[p], j: adds[p] });
    } else {
      out.push({ op: 'del', i: dels[p] });
      out.push({ op: 'add', j: adds[p] });
    }
  }
  for (let q = p; q < dels.length; q++) out.push({ op: 'del', i: dels[q] });
  for (let q = p; q < adds.length; q++) out.push({ op: 'add', j: adds[q] });
}

/** Weighted LCS over the run: maximise total similarity of paired elements. */
function pairBySimilarity(
  dels: number[],
  adds: number[],
  l: unknown[],
  r: unknown[],
  n: ScalarNormalization,
  out: PairedOp[]
): void {
  const m = dels.length;
  const w = adds.length;
  if (m === 0 || w === 0) {
    for (const i of dels) out.push({ op: 'del', i });
    for (const j of adds) out.push({ op: 'add', j });
    return;
  }

  // Similarity below the threshold is zero weight: never a candidate pair.
  const sim = new Float64Array(m * w);
  for (let a = 0; a < m; a++) {
    for (let b = 0; b < w; b++) {
      const v = elementSimilarity(l[dels[a]], r[adds[b]], n);
      sim[a * w + b] = v >= ARRAY_PAIR_THRESHOLD ? v : 0;
    }
  }

  const width = w + 1;
  const dp = new Float64Array((m + 1) * width);
  // 0 = came from above (delete), 1 = from the left (insert), 2 = diagonal (pair)
  const from = new Uint8Array((m + 1) * width);
  for (let a = 1; a <= m; a++) {
    for (let b = 1; b <= w; b++) {
      const up = dp[(a - 1) * width + b];
      const left = dp[a * width + b - 1];
      const s = sim[(a - 1) * w + (b - 1)];
      const diag = s > 0 ? dp[(a - 1) * width + b - 1] + s : -1;
      let best = up;
      let choice = 0;
      if (left >= best) {
        best = left;
        choice = 1;
      }
      if (diag >= best) {
        best = diag;
        choice = 2;
      }
      dp[a * width + b] = best;
      from[a * width + b] = choice;
    }
  }

  const reversed: PairedOp[] = [];
  let a = m;
  let b = w;
  while (a > 0 || b > 0) {
    if (a === 0) {
      reversed.push({ op: 'add', j: adds[--b] });
    } else if (b === 0) {
      reversed.push({ op: 'del', i: dels[--a] });
    } else {
      const choice = from[a * width + b];
      if (choice === 2) {
        reversed.push({ op: 'pair', i: dels[a - 1], j: adds[b - 1] });
        a--;
        b--;
      } else if (choice === 1) {
        reversed.push({ op: 'add', j: adds[--b] });
      } else {
        reversed.push({ op: 'del', i: dels[--a] });
      }
    }
  }
  for (let q = reversed.length - 1; q >= 0; q--) out.push(reversed[q]);
}

function isPrimitive(v: unknown): boolean {
  return v === null || (typeof v !== 'object' && typeof v !== 'function');
}

/**
 * Find a field that identifies elements of both arrays: present on every
 * element, primitive, and unique within each side. Lets `[{id:2},{id:1}]` vs
 * `[{id:1},{id:2}]` match by identity rather than position.
 */
function pickKeyField(
  a: unknown[],
  b: unknown[],
  arrayPath: string,
  rules?: NoiseRule[]
): string | null {
  const usable = (arr: unknown[], field: string) => {
    if (arr.length === 0) return true;
    const seen = new Set<string>();
    for (const el of arr) {
      if (el === null || typeof el !== 'object' || Array.isArray(el)) return false;
      const rec = el as Record<string, unknown>;
      if (!(field in rec) || !isPrimitive(rec[field])) return false;
      const token = String(rec[field]);
      if (seen.has(token)) return false;
      seen.add(token);
    }
    return true;
  };
  if (a.length === 0 && b.length === 0) return null;
  for (const field of ID_KEY_CANDIDATES) {
    // A field the user declared to be noise cannot serve as identity — its
    // values are expected to differ between the two environments.
    if (rules && rules.length && matchingRule(rules, `${arrayPath}[0].${field}`)) continue;
    if (usable(a, field) && usable(b, field)) return field;
  }
  return null;
}

function identityTokens(
  arr: unknown[],
  keyField: string | null,
  arrayPath: string,
  rules: NoiseRule[] | undefined,
  n: ScalarNormalization
): string[] {
  if (keyField) {
    return arr.map(
      (el) => `#${String(normalizeScalar((el as Record<string, unknown>)[keyField], n))}`
    );
  }
  return arr.map((el, i) => canonicalMasked(el, `${arrayPath}[${i}]`, rules, n));
}

// ── noise ──────────────────────────────────────────────────────────────────

function matchingRule(rules: NoiseRule[] | undefined, path: string): NoiseRule | null {
  if (!rules || rules.length === 0) return null;
  for (const rule of rules) {
    if (ruleMatchesPath(rule, path)) return rule;
  }
  return null;
}

/** The old unconditional heuristic, now only consulted when opted in. */
function legacyNoiseType(key: string | null, value: unknown): NoiseClassifier | null {
  if (key === null) return null;
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const fieldType = detectFieldType(key, raw);
  if (fieldType === 'timestamp') {
    if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}|^\d{10,13}$/.test(String(value))) return 'iso8601';
  }
  if (fieldType === 'id') {
    if (typeof value === 'string' && /^[0-9a-f-]+$/i.test(value)) return 'uuid';
  }
  return null;
}

/**
 * Classifier suggestion for a changed scalar. Deliberately two-level: the
 * value must match a classifier AND the field name must agree, so a bare
 * hex-looking string under an unrelated key does not raise a suggestion.
 */
function autoSuggestion(key: string | null, value: unknown): NoiseClassifier | null {
  if (key === null) return null;

  // Epoch timestamps are usually numbers, and the classifiers only read
  // strings, so `"createdAt": 1717000000000` never got a chip while the same
  // value quoted did. A number is only suggested under a time-like key: a
  // 13-digit `orderId` is an id, whatever it looks like.
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !keyLooksTemporal(key)) return null;
    return getClassifier('epoch-millis')?.match(String(value)) ? 'epoch-millis' : null;
  }

  if (typeof value !== 'string') return null;
  if (detectFieldType(key, value) === 'normal') return null;
  for (const c of CLASSIFIERS) {
    if (c.match(value)) return c.name;
  }
  return null;
}

/** `createdAt`, `expires_at`, `timestamp`, `lastLoginOn`, `epochMs`, ... */
function keyLooksTemporal(key: string): boolean {
  return /time|date|epoch|expir/i.test(key) || /_(at|on)$/i.test(key) || /[a-z](At|On)$/.test(key);
}

// ── walk ───────────────────────────────────────────────────────────────────

interface WalkCtx {
  path: string;
  depth: number;
  key: string | null;
  leftComma: boolean;
  rightComma: boolean;
}

interface WalkState {
  b: RowBuilder;
  rules?: NoiseRule[];
  legacyAutoIgnore: boolean;
  sortKeys: boolean;
  inlineSegments: boolean;
  normalization: ScalarNormalization;
  /** Set when any array alignment exceeded its cell budget. */
  degraded: boolean;
}

function renderOne(value: unknown, ctx: WalkCtx, comma: boolean, s: WalkState): Rendered {
  const paths: string[] = [];
  const lines = renderLines(value, { depth: ctx.depth, key: ctx.key, comma, path: ctx.path }, s.sortKeys, [], paths);
  return { lines, paths };
}

function walkPair(l: unknown, r: unknown, ctx: WalkCtx, s: WalkState): void {
  if (ctx.depth > MAX_TREE_DEPTH) throw new DiffDepthExceededError(ctx.depth);

  // A rule anywhere on this path suppresses the whole subtree below it.
  const rule = matchingRule(s.rules, ctx.path);
  if (rule) {
    s.b.unchangedZip(renderOne(l, ctx, ctx.leftComma, s), renderOne(r, ctx, ctx.rightComma, s), {
      noise: noiseFor(rule),
      fieldKey: ctx.key,
      path: ctx.path,
    });
    return;
  }

  const lk = kindOf(l);
  const rk = kindOf(r);

  if (lk === 'object' && rk === 'object') return walkObjects(l as Rec, r as Rec, ctx, s);
  if (lk === 'array' && rk === 'array') return walkArrays(l as unknown[], r as unknown[], ctx, s);
  if (lk === 'scalar' && rk === 'scalar') return walkScalars(l, r, ctx, s);

  // Shape changed (object became a scalar, array became an object, ...).
  // Emit each side's subtree in full rather than pretending they align.
  const meta = { fieldKey: ctx.key, path: ctx.path };
  s.b.removed(renderOne(l, ctx, ctx.leftComma, s), meta);
  s.b.added(renderOne(r, ctx, ctx.rightComma, s), meta);
}

type Rec = Record<string, unknown>;

function walkScalars(l: unknown, r: unknown, ctx: WalkCtx, s: WalkState): void {
  const p = pad(ctx.depth);
  const h = head(ctx.key);
  const leftText = `${p}${h}${JSON.stringify(l)}${ctx.leftComma ? ',' : ''}`;
  const rightText = `${p}${h}${JSON.stringify(r)}${ctx.rightComma ? ',' : ''}`;

  if (l === r || normalizeScalar(l, s.normalization) === normalizeScalar(r, s.normalization)) {
    s.b.pair(leftText, rightText, false, undefined, { fieldKey: ctx.key, path: ctx.path });
    return;
  }

  if (s.legacyAutoIgnore) {
    const legacy = legacyNoiseType(ctx.key, l) ?? legacyNoiseType(ctx.key, r);
    if (legacy) {
      // Labelled 'legacy', not 'rule': there is no saved rule to "forget", and
      // presenting it as one led the UI to offer a Forget action for nothing.
      s.b.pair(leftText, rightText, false, undefined, {
        noise: { type: legacy, source: 'legacy' },
        fieldKey: ctx.key,
        path: ctx.path,
      });
      return;
    }
  }

  // Diff the value span only; the key prefix and comma are scaffolding.
  const segments = s.inlineSegments
    ? computeScalarRowSegments({
        prefix: `${p}${h}`,
        leftValue: JSON.stringify(l),
        rightValue: JSON.stringify(r),
        leftTail: ctx.leftComma ? ',' : '',
        rightTail: ctx.rightComma ? ',' : '',
      })
    : undefined;

  // Suggestion chip lives on the right row; DiffViewer only renders it there.
  const suggestion = autoSuggestion(ctx.key, r) ?? autoSuggestion(ctx.key, l);

  s.b.pair(leftText, rightText, true, segments, { fieldKey: ctx.key, path: ctx.path }, {
    fieldKey: ctx.key,
    path: ctx.path,
    ...(suggestion ? { noise: { type: suggestion, source: 'auto' as const } } : {}),
  });
}

function walkObjects(l: Rec, r: Rec, ctx: WalkCtx, s: WalkState): void {
  const p = pad(ctx.depth);
  const h = head(ctx.key);

  const leftKeys = s.sortKeys ? Object.keys(l).sort() : Object.keys(l);
  const rightKeys = s.sortKeys ? Object.keys(r).sort() : Object.keys(r);

  if (leftKeys.length === 0 && rightKeys.length === 0) {
    s.b.pair(`${p}${h}{}${ctx.leftComma ? ',' : ''}`, `${p}${h}{}${ctx.rightComma ? ',' : ''}`, false, undefined, { path: ctx.path });
    return;
  }

  // Emission order: sorted union when sorting, otherwise left's order with
  // right-only keys appended in right's order.
  let order: string[];
  if (s.sortKeys) {
    order = Array.from(new Set([...leftKeys, ...rightKeys])).sort();
  } else {
    const seen = new Set(leftKeys);
    order = [...leftKeys, ...rightKeys.filter((k) => !seen.has(k))];
  }

  // Commas follow the *emission* order: the last emitted key that exists on a
  // side gets no comma on that side. Taking each document's own last key
  // instead corrupted the right pane whenever key order differed (`{a,b}` vs
  // `{b,a}` with sortKeys off rendered the right side as `"a": 1 / "b": 2,`).
  const lastLeft = [...order].reverse().find((k) => Object.prototype.hasOwnProperty.call(l, k));
  const lastRight = [...order].reverse().find((k) => Object.prototype.hasOwnProperty.call(r, k));

  s.b.pair(`${p}${h}{`, `${p}${h}{`, false, undefined, { path: ctx.path });

  for (const key of order) {
    const inL = Object.prototype.hasOwnProperty.call(l, key);
    const inR = Object.prototype.hasOwnProperty.call(r, key);
    const childCtx: WalkCtx = {
      path: `${ctx.path}.${key}`,
      depth: ctx.depth + 1,
      key,
      leftComma: inL && key !== lastLeft,
      rightComma: inR && key !== lastRight,
    };
    const meta = { fieldKey: key, path: childCtx.path };
    if (inL && inR) walkPair(l[key], r[key], childCtx, s);
    else if (inL) s.b.removed(renderOne(l[key], childCtx, childCtx.leftComma, s), meta);
    else s.b.added(renderOne(r[key], childCtx, childCtx.rightComma, s), meta);
  }

  // Closing brace: the comma differs per side but that is never an edit.
  s.b.pair(`${p}}${ctx.leftComma ? ',' : ''}`, `${p}}${ctx.rightComma ? ',' : ''}`, false, undefined, { path: ctx.path });
}

function walkArrays(l: unknown[], r: unknown[], ctx: WalkCtx, s: WalkState): void {
  const p = pad(ctx.depth);
  const h = head(ctx.key);

  if (l.length === 0 && r.length === 0) {
    s.b.pair(`${p}${h}[]${ctx.leftComma ? ',' : ''}`, `${p}${h}[]${ctx.rightComma ? ',' : ''}`, false, undefined, { path: ctx.path });
    return;
  }

  s.b.pair(`${p}${h}[`, `${p}${h}[`, false, undefined, { path: ctx.path });

  const keyField = pickKeyField(l, r, ctx.path, s.rules);
  const alignment = alignSequences(
    identityTokens(l, keyField, ctx.path, s.rules, s.normalization),
    identityTokens(r, keyField, ctx.path, s.rules, s.normalization),
    MAX_ARRAY_LCS_CELLS
  );
  if (alignment.degraded) s.degraded = true;
  const ops = pairAdjacentEdits(alignment.ops, l, r, s.normalization);

  for (const op of ops) {
    if (op.op === 'pair') {
      // Same record, edited. Recurse so only the changed fields are marked.
      walkPair(l[op.i], r[op.j], {
        path: `${ctx.path}[${op.i}]`,
        depth: ctx.depth + 1,
        key: null,
        leftComma: op.i < l.length - 1,
        rightComma: op.j < r.length - 1,
      }, s);
    } else if (op.op === 'match') {
      const childCtx: WalkCtx = {
        path: `${ctx.path}[${op.i}]`,
        depth: ctx.depth + 1,
        key: null,
        leftComma: op.i < l.length - 1,
        rightComma: op.j < r.length - 1,
      };
      // Identical elements still need rendering, but skip the recursive walk.
      if (deepEquals(l[op.i], r[op.j], s.normalization) && childCtx.leftComma === childCtx.rightComma) {
        s.b.unchangedZip(
          renderOne(l[op.i], childCtx, childCtx.leftComma, s),
          renderOne(r[op.j], childCtx, childCtx.rightComma, s),
          { path: childCtx.path }
        );
      } else {
        walkPair(l[op.i], r[op.j], childCtx, s);
      }
    } else if (op.op === 'del') {
      const childCtx: WalkCtx = {
        path: `${ctx.path}[${op.i}]`,
        depth: ctx.depth + 1,
        key: null,
        leftComma: op.i < l.length - 1,
        rightComma: false,
      };
      s.b.removed(renderOne(l[op.i], childCtx, childCtx.leftComma, s), { path: childCtx.path });
    } else {
      const childCtx: WalkCtx = {
        path: `${ctx.path}[${op.j}]`,
        depth: ctx.depth + 1,
        key: null,
        leftComma: false,
        rightComma: op.j < r.length - 1,
      };
      s.b.added(renderOne(r[op.j], childCtx, childCtx.rightComma, s), { path: childCtx.path });
    }
  }

  s.b.pair(`${p}]${ctx.leftComma ? ',' : ''}`, `${p}]${ctx.rightComma ? ',' : ''}`, false, undefined, { path: ctx.path });
}

/**
 * Number of lines `renderLines` would produce, without producing them.
 *
 * The entry point used to render both documents in full just to decide
 * whether inline segments are affordable, and then rendered them again
 * during the walk. This is the same count, iterative and allocation-free:
 * a scalar or empty container is one line, any other container is its
 * opening and closing lines plus its children.
 */
function countRenderedRows(value: unknown): number {
  let rows = 0;
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const v = stack.pop();
    if (Array.isArray(v)) {
      if (v.length === 0) rows += 1;
      else {
        rows += 2;
        for (const el of v) stack.push(el);
      }
    } else if (v !== null && typeof v === 'object') {
      const keys = Object.keys(v as Record<string, unknown>);
      if (keys.length === 0) rows += 1;
      else {
        rows += 2;
        for (const k of keys) stack.push((v as Record<string, unknown>)[k]);
      }
    } else {
      rows += 1;
    }
  }
  return rows;
}

// ── entry point ────────────────────────────────────────────────────────────

/**
 * Diff two already-parsed JSON values.
 *
 * Both panes of the result are index-aligned and each reads back as the
 * document it represents.
 */
export function computeJsonTreeDiff(
  leftValue: unknown,
  rightValue: unknown,
  options: JsonTreeDiffOptions = {}
): DiffResult {
  const sortKeys = options.sortKeys !== false;

  // Estimating size up front is cheaper than unwinding a huge diff halfway.
  const estimatedRows = countRenderedRows(leftValue) + countRenderedRows(rightValue);

  const optionRules: NoiseRule[] = (options.ignoredPaths ?? [])
    .filter(isValidRulePath)
    .map((path) => ({ path, type: 'uuid', source: 'manual', createdAt: 0 }));
  for (const rule of optionRules) OPTION_RULES.add(rule);
  const rules = optionRules.length ? [...(options.rules ?? []), ...optionRules] : options.rules;

  const state: WalkState = {
    b: new RowBuilder(),
    rules,
    legacyAutoIgnore: options.legacyAutoIgnore === true,
    sortKeys,
    inlineSegments: options.inlineSegments !== false && estimatedRows <= INLINE_SEGMENT_MAX_ROWS,
    normalization: {
      semanticComparison: options.semanticComparison === true,
      ignoreCase: options.ignoreCase === true,
      ignoreWhitespace: options.ignoreWhitespace === true,
    },
    degraded: false,
  };

  walkPair(
    leftValue,
    rightValue,
    { path: '$', depth: 0, key: null, leftComma: false, rightComma: false },
    state
  );

  const result = state.b.result();
  return state.degraded ? { ...result, degraded: true } : result;
}

/** Convenience wrapper for callers holding JSON text. Throws on invalid JSON. */
export function computeJsonTreeDiffFromText(
  leftText: string,
  rightText: string,
  options: JsonTreeDiffOptions = {}
): DiffResult {
  return computeJsonTreeDiff(JSON.parse(leftText), JSON.parse(rightText), options);
}
