import { detectFieldType, CLASSIFIERS } from './smartComparison';
import { ruleMatchesPath, type NoiseRule } from './noiseRules';
import { computeJsonTreeDiff } from './jsonTreeDiff';
import { calculateSimilarity, computeInlineSegments, clearSimilarityCache } from './inlineSegments';
import type {
  DiffLine,
  DiffLineType,
  DiffResult,
  DiffSegment,
  ComparisonConfig,
  NoiseAnnotation,
} from './diffTypes';

// Re-exported so existing `from '@/lib/diffAlgorithm'` imports keep working.
export type { DiffLine, DiffLineType, DiffResult, DiffSegment, ComparisonConfig, NoiseAnnotation };
export { clearSimilarityCache };

/**
 * Budget for the LCS table, in cells, shared by the text and array paths.
 *
 * This replaces a flat line-count cap. A count-based guard creates an inverted
 * cliff — the *worst* input sits just below the threshold, and one line more
 * flips to a positional zip that reports a single insertion as a full rewrite
 * (measured: 1499 lines gave +1/-0 in 82ms; 1500 gave +751/-750 in 4ms). It
 * also rejected cheap asymmetric inputs like 5000x20.
 *
 * A cell budget tracks the thing that actually costs: 16M cells of Int32Array
 * is 64 MB, and 3000x3000 (9M) completes well inside the project's budget.
 * Anything past it degrades — and says so via `degraded`.
 */
const MAX_LCS_CELLS = 16_000_000;

/** Minimum normalized similarity for two lines to pair into one `modified` row. */
const MODIFIED_PAIR_THRESHOLD = 0.3;

export interface ComputeDiffOptions {
  advancedMode?: boolean;
  config?: ComparisonConfig;
  rules?: NoiseRule[];
  /**
   * Opt in to the legacy heuristic that erased id-shaped and timestamp-shaped
   * values before comparing. Off by default — see `JsonTreeDiffOptions`.
   */
  legacyAutoIgnore?: boolean;
  /** Render object keys sorted on both sides so key order never diffs. */
  sortKeys?: boolean;
  /** Treat "5" and 5 as equal. Mirrors the Diff Options panel switch. */
  semanticComparison?: boolean;
  /** Compare strings case-insensitively. */
  ignoreCase?: boolean;
  /** Collapse runs of whitespace in strings before comparing. */
  ignoreWhitespace?: boolean;
}

// ── normalization (text path) ──────────────────────────────────────────────

/**
 * Characters that are invisible or that masquerade as a plain space.
 *
 * These are PRESERVED by default. They used to be erased on every comparison
 * with no way to opt out, which meant a zero-width space or NBSP pasted in from
 * a wiki or Slack — the single most common "why won't this parse" cause — made
 * the diff report "no differences". Hiding the thing the user came to find is
 * the worst outcome available, so finding it is now the default and ignoring it
 * is the opt-in.
 */
const INVISIBLE_STRIP = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF\uE000-\uF8FF]/g;
const INVISIBLE_TO_SPACE = /[\u00A0\u2000-\u200A\u202F\u3000]/g;

/** Fold invisible characters away, for comparison or for detection. */
export function stripInvisible(text: string): string {
  return text.replace(INVISIBLE_STRIP, '').replace(INVISIBLE_TO_SPACE, ' ');
}

function normalizeLine(line: string, config?: ComparisonConfig): string {
  let normalized = line;

  // Line endings. A stray CR from a CRLF file is rarely the difference anyone
  // is hunting, so it is folded by default — but it is a real switch now.
  if (config?.ignoreLineEndings !== false) {
    normalized = normalized
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n/g, '');
  }

  if (config?.ignoreInvisibleCharacters === true) {
    normalized = stripInvisible(normalized);
  }

  normalized = normalized.replace(/\t/g, '  ');

  // Indentation is structure in YAML, so an explicit `false` must be honoured
  // here rather than overridden by format type.
  if (config?.normalizeIndentation !== false) {
    // Indentation is spaces and tabs specifically, and the remainder must be
    // matched with [\s\S] rather than `.` — `.` excludes \r, so rebuilding the
    // line as indent + content silently deleted a CR the caller asked to keep.
    const match = normalized.match(/^([ \t]*)([\s\S]*)$/);
    if (match) {
      const [, indent, content] = match;
      const indentLevel = Math.round(indent.length / 2);
      normalized = '  '.repeat(indentLevel) + content;
    }
  }

  if (config?.ignoreTrailingWhitespace !== false) {
    normalized =
      config?.ignoreLineEndings === false
        ? normalized.replace(/[^\S\r]+$/, '') // keep a deliberate CR
        : normalized.trimEnd();
  }

  if (config?.ignoreWhitespace) {
    normalized = normalized.replace(/\s+/g, ' ').trim();
  }

  // NOTE: there were two YAML-specific rewrites here — stripping quotes around
  // an end-of-line value, and collapsing every `\s*:\s*` to ': '. Both are
  // lossy, and both were unreachable dead code while YAML routed through
  // `computeStructuralDiff`. Sending YAML down this path activated them, and
  // they made YAML mode *worse than plain text*: `"yes"` vs `yes` (string vs
  // boolean), `"3"` vs `3`, `""` vs null, and even `containerPort:8080`
  // (invalid YAML) vs `containerPort: 8080` all reported "no differences".
  // Diffing a broken manifest against a working one is the whole point of the
  // mode, so the rewrites are gone rather than patched.

  return normalized;
}

// ── text diff ──────────────────────────────────────────────────────────────

type LineOp =
  | { t: 'eq'; i: number; j: number }
  | { t: 'del'; i: number }
  | { t: 'add'; j: number };

/**
 * LCS edit script over pre-normalized lines, in forward order.
 *
 * The table is one flat `Int32Array` rather than an array of arrays: 4 bytes a
 * cell instead of a boxed number plus per-row object overhead, which is what
 * makes a 9M-cell table practical. Ops are pushed and reversed rather than
 * unshifted — `unshift` is O(n) per call, so building a large edit script that
 * way is quadratic on its own.
 */
function lineOps(a: string[], b: string[]): LineOp[] {
  const m = a.length;
  const n = b.length;
  const width = n + 1;
  const dp = new Int32Array((m + 1) * width);

  for (let i = 1; i <= m; i++) {
    const row = i * width;
    const prev = row - width;
    const ai = a[i - 1];
    for (let j = 1; j <= n; j++) {
      dp[row + j] =
        ai === b[j - 1]
          ? dp[prev + j - 1] + 1
          : Math.max(dp[prev + j], dp[row + j - 1]);
    }
  }

  const reversed: LineOp[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      reversed.push({ t: 'eq', i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i * width + j - 1] >= dp[(i - 1) * width + j])) {
      reversed.push({ t: 'add', j: j - 1 });
      j--;
    } else {
      reversed.push({ t: 'del', i: i - 1 });
      i--;
    }
  }
  return reversed.reverse();
}

/**
 * Turn an edit script into aligned rows.
 *
 * A run of deletions immediately followed by a run of insertions is the shape
 * of an edit rather than a delete-plus-insert, so those are paired into
 * `modified` rows when the lines are similar enough to be worth an inline
 * highlight. Anything unpaired stays a plain delete or insert — which is what
 * makes a lone insertion report as exactly one addition.
 */
function rowsFromOps(
  ops: LineOp[],
  leftLines: string[],
  rightLines: string[],
  leftNorm: string[],
  rightNorm: string[],
  advanced: boolean
): DiffResult {
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];
  let additions = 0;
  let removals = 0;

  const emitEq = (i: number, j: number) => {
    left.push({ content: leftLines[i], type: 'unchanged', lineNumber: i + 1 });
    right.push({ content: rightLines[j], type: 'unchanged', lineNumber: j + 1 });
  };
  const emitDel = (i: number) => {
    left.push({ content: leftLines[i], type: 'removed', lineNumber: i + 1 });
    right.push({ content: '', type: 'empty', lineNumber: null });
    removals++;
  };
  const emitAdd = (j: number) => {
    left.push({ content: '', type: 'empty', lineNumber: null });
    right.push({ content: rightLines[j], type: 'added', lineNumber: j + 1 });
    additions++;
  };
  const emitMod = (i: number, j: number) => {
    const segs = advanced ? computeInlineSegments(leftLines[i], rightLines[j]) : undefined;
    left.push({ content: leftLines[i], type: 'modified', lineNumber: i + 1, segments: segs?.leftSegments });
    right.push({ content: rightLines[j], type: 'modified', lineNumber: j + 1, segments: segs?.rightSegments });
    removals++;
    additions++;
  };

  let k = 0;
  while (k < ops.length) {
    const op = ops[k];
    if (op.t === 'eq') {
      emitEq(op.i, op.j);
      k++;
      continue;
    }

    // Collect the current run of deletions then insertions.
    const dels: number[] = [];
    const adds: number[] = [];
    while (k < ops.length && ops[k].t === 'del') dels.push((ops[k++] as { i: number }).i);
    while (k < ops.length && ops[k].t === 'add') adds.push((ops[k++] as { j: number }).j);

    if (!advanced) {
      dels.forEach(emitDel);
      adds.forEach(emitAdd);
      continue;
    }

    const paired = Math.min(dels.length, adds.length);
    let p = 0;
    for (; p < paired; p++) {
      const li = dels[p];
      const rj = adds[p];
      if (calculateSimilarity(leftNorm[li], rightNorm[rj]) >= MODIFIED_PAIR_THRESHOLD) {
        emitMod(li, rj);
      } else {
        emitDel(li);
        emitAdd(rj);
      }
    }
    for (let q = p; q < dels.length; q++) emitDel(dels[q]);
    for (let q = p; q < adds.length; q++) emitAdd(adds[q]);
  }

  return { left, right, additions, removals, hasDifferences: additions > 0 || removals > 0 };
}

/** Positional fallback for inputs too large for an O(m*n) table. */
function computeSimpleDiffWithNormalization(
  leftLines: string[],
  rightLines: string[],
  leftNormalized: string[],
  rightNormalized: string[]
): DiffResult {
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];
  let additions = 0;
  let removals = 0;

  const maxLength = Math.max(leftLines.length, rightLines.length);

  for (let i = 0; i < maxLength; i++) {
    if (i < leftLines.length && i < rightLines.length) {
      if (leftNormalized[i] === rightNormalized[i]) {
        left.push({ content: leftLines[i], type: 'unchanged', lineNumber: i + 1 });
        right.push({ content: rightLines[i], type: 'unchanged', lineNumber: i + 1 });
      } else {
        left.push({ content: leftLines[i], type: 'removed', lineNumber: i + 1 });
        right.push({ content: rightLines[i], type: 'added', lineNumber: i + 1 });
        removals++;
        additions++;
      }
    } else if (i < leftLines.length) {
      left.push({ content: leftLines[i], type: 'removed', lineNumber: i + 1 });
      right.push({ content: '', type: 'empty', lineNumber: null });
      removals++;
    } else {
      left.push({ content: '', type: 'empty', lineNumber: null });
      right.push({ content: rightLines[i], type: 'added', lineNumber: i + 1 });
      additions++;
    }
  }

  return { left, right, additions, removals, hasDifferences: additions > 0 || removals > 0 };
}

function computeTextDiff(
  leftText: string,
  rightText: string,
  config: ComparisonConfig,
  advanced: boolean
): DiffResult {
  const leftLines = leftText.split('\n');
  const rightLines = rightText.split('\n');
  const leftNorm = leftLines.map((l) => normalizeLine(l, config));
  const rightNorm = rightLines.map((l) => normalizeLine(l, config));

  // Identical after normalization — nothing to align.
  if (leftNorm.length === rightNorm.length && leftNorm.every((l, i) => l === rightNorm[i])) {
    return {
      left: leftLines.map((content, i) => ({ content, type: 'unchanged' as const, lineNumber: i + 1 })),
      right: rightLines.map((content, i) => ({ content, type: 'unchanged' as const, lineNumber: i + 1 })),
      additions: 0,
      removals: 0,
      hasDifferences: false,
    };
  }

  // The O(m*n) table is the only superlinear step. Past the cell budget,
  // degrade to a positional diff rather than exhausting memory — and mark the
  // result so the UI can say the alignment is approximate instead of
  // presenting a wall of red and green as fact.
  if ((leftLines.length + 1) * (rightLines.length + 1) > MAX_LCS_CELLS) {
    return {
      ...computeSimpleDiffWithNormalization(leftLines, rightLines, leftNorm, rightNorm),
      degraded: true,
    };
  }

  return rowsFromOps(lineOps(leftNorm, rightNorm), leftLines, rightLines, leftNorm, rightNorm, advanced);
}

// ── entry point ────────────────────────────────────────────────────────────

/** How many distinct lossy literals to name before truncating the warning. */
const MAX_REPORTED_LOSSY_NUMBERS = 5;

/**
 * Find number literals that `JSON.parse` cannot represent exactly.
 *
 * JSON numbers become IEEE-754 doubles, so a 19-digit Snowflake ID, a Java
 * `long` primary key or a `bigint` balance is silently rounded — two distinct
 * IDs can then compare equal, and the rendered pane shows a number the server
 * never sent. That is a silent wrong answer on exactly the data this tool
 * exists to compare, so it is surfaced rather than fixed by guesswork.
 *
 * String contents are blanked first so digits inside string values are not
 * mistaken for numeric literals.
 */
export function detectNumericPrecisionLoss(jsonText: string): string[] {
  const scrubbed = jsonText.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const literals = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

  const found: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = literals.exec(scrubbed)) !== null) {
    const token = m[0];
    if (seen.has(token)) continue;

    const parsed = Number(token);
    let lossy = false;

    if (!Number.isFinite(parsed)) {
      lossy = true; // 1e400 -> Infinity, which JSON.stringify then renders null
    } else if (!/[.eE]/.test(token)) {
      // Integer literal: compare exactly, via BigInt, against what we read.
      try {
        lossy = BigInt(token) !== BigInt(parsed);
      } catch {
        lossy = false;
      }
    }

    if (lossy) {
      seen.add(token);
      found.push(token);
      if (found.length >= MAX_REPORTED_LOSSY_NUMBERS) break;
    }
  }
  return found;
}

/**
 * Build user-facing precision warnings for two raw JSON texts.
 *
 * Must be given the *raw* response bodies. Anything that has already been
 * through `formatJson` (or any JSON.parse/stringify round-trip) has already
 * lost the precision, so scanning it finds nothing — the rounded literal round-
 * trips cleanly by definition.
 */
export function precisionWarnings(leftText: string, rightText: string): string[] {
  const tokens = Array.from(
    new Set([...detectNumericPrecisionLoss(leftText), ...detectNumericPrecisionLoss(rightText)])
  ).slice(0, MAX_REPORTED_LOSSY_NUMBERS);

  if (tokens.length === 0) return [];

  const rendered = tokens.map((t) => `${t} → ${Number(t)}`).join(', ');
  return [
    `Some numbers exceed the precision JavaScript can represent and were rounded when read: ${rendered}. ` +
      `Values this large (Snowflake IDs, bigint keys) may compare as identical even when they differ.`,
  ];
}

/**
 * Warn when two rows differ *only* by characters nobody can see.
 *
 * Without this the panes show two visually identical lines marked as changed,
 * which reads as a bug in the tool rather than a finding about the data.
 */
function invisibleOnlyWarnings(result: DiffResult): string[] {
  const rows = Math.min(result.left.length, result.right.length);
  for (let i = 0; i < rows; i++) {
    const left = result.left[i];
    const right = result.right[i];
    if (!left || !right || left.type === 'empty' || right.type === 'empty') continue;

    const a = left.content ?? '';
    const b = right.content ?? '';
    if (a !== b && stripInvisible(a) === stripInvisible(b)) {
      return [
        'Some lines differ only by invisible characters (zero-width spaces, non-breaking ' +
          'spaces, a BOM or control codes). They will look identical on screen. Turn on ' +
          '"Ignore invisible characters" to treat them as equal.',
      ];
    }
  }
  return [];
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export function computeDiff(
  leftText: string,
  rightText: string,
  options?: ComputeDiffOptions
): DiffResult {
  const config = options?.config || {};
  const advanced = options?.advancedMode !== false;

  // JSON on both sides → compare the parsed values, not their rendering.
  const leftJson = tryParseJson(leftText);
  const rightJson = tryParseJson(rightText);
  if (leftJson.ok && rightJson.ok) {
    const result = computeJsonTreeDiff(leftJson.value, rightJson.value, {
      rules: options?.rules,
      legacyAutoIgnore: options?.legacyAutoIgnore,
      sortKeys: options?.sortKeys,
      inlineSegments: advanced,
      semanticComparison: options?.semanticComparison,
      ignoreCase: options?.ignoreCase,
      ignoreWhitespace: options?.ignoreWhitespace,
    });
    const warnings = [...precisionWarnings(leftText, rightText), ...invisibleOnlyWarnings(result)];
    return warnings.length > 0 ? { ...result, warnings } : result;
  }

  // YAML and config files go through the same LCS path as plain text.
  //
  // `computeStructuralDiff` was written to stop a missing field from marking
  // every following line as changed — but that cascade is exactly what an LCS
  // alignment prevents, and doing it properly also avoids that matcher's
  // positional heuristics (which could drop added lines from the rendered
  // pane). `normalizeLine` already applies the YAML-specific quote and colon
  // normalization when `formatType` says so.
  const textResult = computeTextDiff(leftText, rightText, config, advanced);
  const textWarnings = invisibleOnlyWarnings(textResult);
  return textWarnings.length > 0 ? { ...textResult, warnings: textWarnings } : textResult;
}

export function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function formatHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

// ───────────────────────────────────────────────────────────────────────────
// Legacy marker injection.
//
// DEPRECATED: the diff pipeline no longer calls this. `computeJsonTreeDiff`
// emits `/* NOISE:<type>:<source> */` markers directly while walking the
// parsed tree, which is both cheaper and correct for nested paths. This is
// kept because it is a pure function with its own test coverage and is safe
// to call; it can be removed once nothing references it.
// ───────────────────────────────────────────────────────────────────────────

export function preprocessJsonForComparison(jsonText: string, rules?: NoiseRule[]): string {
  const lines = jsonText.split('\n');
  const safeRules = rules && rules.length ? rules : null;

  type Frame = { key: string | null; isArray: boolean; arrayIndex: number };
  const stack: Frame[] = [];

  function pathFor(currentKey: string | null): string {
    let p = '$';
    for (let idx = 0; idx < stack.length; idx++) {
      const frame = stack[idx];
      if (frame.key !== null) p += `.${frame.key}`;
      if (frame.isArray) p += `[${Math.max(0, frame.arrayIndex - 1)}]`;
    }
    if (currentKey !== null) p += `.${currentKey}`;
    return p;
  }

  const out: string[] = new Array(lines.length);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fieldMatch = line.match(/^(\s*)"([^"]+)"\s*:\s*(.+)$/);
    const arrayElementOpen = !fieldMatch && /^\s*[{[]\s*$/.test(line);
    const closeMatch = line.match(/^(\s*)([}\]])\s*,?\s*$/);
    const arrayElementScalar =
      !fieldMatch && !arrayElementOpen && !closeMatch && /^\s*[^\s].*$/.test(line.trim()) && line.trim() !== '';

    let processed = line;

    if (fieldMatch) {
      const [, indent, key, valueRaw] = fieldMatch;
      const value = valueRaw.replace(/,\s*$/, '').trim();

      const isContainerOpen = value === '{' || value === '[';
      if (!isContainerOpen) {
        const fieldType = detectFieldType(key, value);
        let appended = '';

        if (fieldType === 'timestamp') {
          if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}|\d{10,13}/.test(value)) appended += ' /* TIMESTAMP */';
        } else if (fieldType === 'id') {
          if (/"[0-9a-f-]+"|"(usr_|sess_|prod_|req_)[^"]+"/.test(value)) appended += ' /* ID */';
        }

        const valueForClassifier = stripQuotes(value);
        if (fieldType !== 'normal' && valueForClassifier !== null) {
          for (const c of CLASSIFIERS) {
            if (c.match(valueForClassifier)) {
              appended += ` /* NOISE:${c.name}:auto */`;
              break;
            }
          }
        }

        if (safeRules) {
          const currentPath = pathFor(key);
          for (const rule of safeRules) {
            if (ruleMatchesPath(rule, currentPath)) {
              appended += ` /* NOISE:${rule.type}:rule */`;
              break;
            }
          }
        }

        if (appended) {
          const hadComma = /,\s*$/.test(valueRaw);
          processed = `${indent}"${key}": ${value}${hadComma ? ',' : ''}${appended}`;
        }
      }
    }

    out[i] = processed;

    if (fieldMatch) {
      const [, , key, valueRaw] = fieldMatch;
      const value = valueRaw.trim();
      if (value.startsWith('{')) stack.push({ key, isArray: false, arrayIndex: 0 });
      else if (value.startsWith('[')) stack.push({ key, isArray: true, arrayIndex: 0 });
    } else if (arrayElementOpen) {
      const parent = stack[stack.length - 1];
      if (parent && parent.isArray) parent.arrayIndex += 1;
      const trimmed = line.trim();
      if (trimmed.startsWith('{')) stack.push({ key: null, isArray: false, arrayIndex: 0 });
      else if (trimmed.startsWith('[')) stack.push({ key: null, isArray: true, arrayIndex: 0 });
    } else if (arrayElementScalar) {
      const parent = stack[stack.length - 1];
      if (parent && parent.isArray) parent.arrayIndex += 1;
    } else if (closeMatch) {
      stack.pop();
    }
  }

  return out.join('\n');
}

function stripQuotes(value: string): string | null {
  const v = value.trim().replace(/,\s*$/, '');
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) return v.slice(1, -1);
  return v;
}
