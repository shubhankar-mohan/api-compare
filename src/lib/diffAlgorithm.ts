import type { NoiseRule } from './noiseRules';
import { computeJsonTreeDiff } from './jsonTreeDiff';
import { calculateSimilarity, computeInlineSegments, clearSimilarityCache } from './inlineSegments';
import { alignSequences, type AlignOp } from './sequenceAlign';
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
 * The budget applies after the common prefix and suffix are trimmed (see
 * `sequenceAlign.ts`), so a large document with a small change never hits it.
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
  ops: AlignOp[],
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
    if (op.op === 'match') {
      emitEq(op.i, op.j);
      k++;
      continue;
    }

    // Collect the current run of deletions then insertions.
    const dels: number[] = [];
    const adds: number[] = [];
    while (k < ops.length && ops[k].op === 'del') dels.push((ops[k++] as { i: number }).i);
    while (k < ops.length && ops[k].op === 'add') adds.push((ops[k++] as { j: number }).j);

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

  // The O(m*n) table is the only superlinear step. The aligner trims the
  // common prefix and suffix first, so the budget only applies to what
  // differs; past it the middle is zipped positionally and the result is
  // marked so the UI can say the alignment is approximate instead of
  // presenting a wall of red and green as fact.
  const alignment = alignSequences(leftNorm, rightNorm, MAX_LCS_CELLS);
  const result = rowsFromOps(alignment.ops, leftLines, rightLines, leftNorm, rightNorm, advanced);
  return alignment.degraded ? { ...result, degraded: true } : result;
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
