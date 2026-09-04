/**
 * Inline (sub-line) diffing: given two versions of one line, produce the
 * highlighted segment runs shown inside a `modified` row.
 *
 * Extracted from diffAlgorithm so both the text path and the JSON tree path
 * can share one implementation (and one Levenshtein).
 */

import type { DiffSegment } from './diffTypes';

// Beyond this many characters the O(m*n) tables get expensive and the result
// stops being readable anyway — fall back to whole-line replace.
const CHAR_DIFF_MAX = 500;
const WORD_DIFF_MAX = 1000;
const LEVENSHTEIN_MAX = 300;

/** Longest common subsequence table. Callers must respect the size caps above. */
function lcsTable<T>(a: T[], b: T[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/** Levenshtein distance, single-row (O(min(m,n)) space), inputs capped. */
export function levenshteinDistance(str1: string, str2: string): number {
  const s1 = str1.length > LEVENSHTEIN_MAX ? str1.substring(0, LEVENSHTEIN_MAX) : str1;
  const s2 = str2.length > LEVENSHTEIN_MAX ? str2.substring(0, LEVENSHTEIN_MAX) : str2;

  const a = s1.length > s2.length ? s2 : s1;
  const b = s1.length > s2.length ? s1 : s2;
  const aLen = a.length;
  const bLen = b.length;

  let prev = new Array(aLen + 1);
  let curr = new Array(aLen + 1);

  for (let j = 0; j <= aLen; j++) prev[j] = j;

  for (let i = 1; i <= bLen; i++) {
    curr[0] = i;
    for (let j = 1; j <= aLen; j++) {
      curr[j] =
        b.charAt(i - 1) === a.charAt(j - 1)
          ? prev[j - 1]
          : Math.min(prev[j - 1] + 1, curr[j - 1] + 1, prev[j] + 1);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[aLen];
}

const similarityCache = new Map<string, number>();
const SIMILARITY_CACHE_CAP = 1000;

/** Normalized similarity in [0,1]. Cached; cache is halved when it fills. */
export function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;

  const sample1 =
    str1.length <= 100
      ? str1
      : `${str1.length}:${str1.substring(0, 50)}:${str1.substring(str1.length - 50)}`;
  const sample2 =
    str2.length <= 100
      ? str2
      : `${str2.length}:${str2.substring(0, 50)}:${str2.substring(str2.length - 50)}`;
  const cacheKey = `${sample1}|||${sample2}`;

  const cached = similarityCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  if (longer.length === 0) return 1;

  const similarity = (longer.length - levenshteinDistance(longer, shorter)) / longer.length;

  if (similarityCache.size > SIMILARITY_CACHE_CAP) {
    const keys = Array.from(similarityCache.keys());
    for (let k = 0; k < SIMILARITY_CACHE_CAP / 2; k++) similarityCache.delete(keys[k]);
  }
  similarityCache.set(cacheKey, similarity);

  return similarity;
}

export function clearSimilarityCache(): void {
  similarityCache.clear();
}

function mergeRuns(items: { text: string; type: DiffSegment['type'] }[]): DiffSegment[] {
  const result: DiffSegment[] = [];
  for (const item of items) {
    const last = result[result.length - 1];
    if (last && last.type === item.type) last.text += item.text;
    else result.push({ text: item.text, type: item.type });
  }
  return result;
}

/** Backtrack an LCS table into per-side segment runs. */
function backtrack<T>(
  a: T[],
  b: T[],
  dp: number[][],
  render: (t: T) => string
): { leftSegments: DiffSegment[]; rightSegments: DiffSegment[] } {
  const tempLeft: { text: string; type: DiffSegment['type'] }[] = [];
  const tempRight: { text: string; type: DiffSegment['type'] }[] = [];

  let i = a.length;
  let j = b.length;

  // Built back-to-front then reversed. `unshift` shifts every existing element
  // on each call, which made segment assembly quadratic in the number of runs
  // and dominated the cost of diffing thousands of changed lines.
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      tempLeft.push({ text: render(a[i - 1]), type: 'unchanged' });
      tempRight.push({ text: render(b[j - 1]), type: 'unchanged' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tempRight.push({ text: render(b[j - 1]), type: 'added' });
      j--;
    } else if (i > 0) {
      tempLeft.push({ text: render(a[i - 1]), type: 'removed' });
      i--;
    }
  }
  tempLeft.reverse();
  tempRight.reverse();

  return { leftSegments: mergeRuns(tempLeft), rightSegments: mergeRuns(tempRight) };
}

function wholeLineReplace(left: string, right: string) {
  return {
    leftSegments: [{ text: left, type: 'removed' as const }],
    rightSegments: [{ text: right, type: 'added' as const }],
  };
}

/** Character-level diff. Precise, but only for short lines. */
export function computeCharDiff(leftLine: string, rightLine: string) {
  if (leftLine.length > CHAR_DIFF_MAX || rightLine.length > CHAR_DIFF_MAX) {
    return wholeLineReplace(leftLine, rightLine);
  }
  // Array.from iterates code points, so a surrogate pair stays one unit. Using
  // split('') here produced lone surrogates whenever two emoji shared a lead
  // surrogate, and the viewer rendered those as U+FFFD.
  const a = Array.from(leftLine);
  const b = Array.from(rightLine);
  return backtrack(a, b, lcsTable(a, b), (c) => c);
}

/** Split on whitespace, keeping the whitespace as its own token. */
function tokenize(str: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const char of str) {
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push(char);
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Inline diff for one changed line. Uses character granularity when the two
 * sides are similar enough for it to read well, word granularity otherwise.
 */
export function computeInlineSegments(leftLine: string, rightLine: string) {
  if (leftLine.length > WORD_DIFF_MAX || rightLine.length > WORD_DIFF_MAX) {
    return wholeLineReplace(leftLine, rightLine);
  }

  if (
    leftLine.length < CHAR_DIFF_MAX &&
    rightLine.length < CHAR_DIFF_MAX &&
    calculateSimilarity(leftLine, rightLine) > 0.2
  ) {
    return computeCharDiff(leftLine, rightLine);
  }

  const a = tokenize(leftLine);
  const b = tokenize(rightLine);
  return backtrack(a, b, lcsTable(a, b), (t) => t);
}
