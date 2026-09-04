/**
 * Sequence alignment shared by the text path (lines) and the JSON tree path
 * (array element identity tokens).
 *
 * The two paths used to carry their own copy of the same LCS table, and both
 * ran it over the *whole* input. That made the cell budget bite on the most
 * common real input there is: a large document with one small change. A
 * 4500-line file with one inserted line is 20M cells — past the budget — and
 * so degraded to a positional zip that reported every line after the
 * insertion as rewritten. The array path did the same and did not even flag
 * it.
 *
 * Two things fix that:
 *
 * - The common prefix and suffix are stripped before the table is built. An
 *   insertion, a deletion or a localized edit then leaves a middle of a few
 *   items, whatever the document size, and the O(m*n) cost only applies to
 *   what actually differs.
 * - Tokens are interned to integers first, so the inner loop compares numbers
 *   rather than strings. Identity tokens on the array path are full canonical
 *   serializations and can be kilobytes each.
 *
 * When the *middle* still exceeds the budget the caller gets a positional
 * fallback and `degraded: true`, so the UI can say the alignment is
 * approximate instead of presenting a wall of red and green as fact.
 */

export type AlignOp =
  | { op: 'match'; i: number; j: number }
  | { op: 'del'; i: number }
  | { op: 'add'; j: number };

export interface Alignment {
  ops: AlignOp[];
  /** True when the input exceeded the cell budget and was zipped positionally. */
  degraded: boolean;
}

/** Longest-common-subsequence alignment of two token sequences. */
export function alignSequences(a: string[], b: string[], cellBudget: number): Alignment {
  const m = a.length;
  const n = b.length;

  let prefix = 0;
  while (prefix < m && prefix < n && a[prefix] === b[prefix]) prefix++;

  let suffix = 0;
  while (suffix < m - prefix && suffix < n - prefix && a[m - 1 - suffix] === b[n - 1 - suffix]) {
    suffix++;
  }

  const ops: AlignOp[] = [];
  for (let k = 0; k < prefix; k++) ops.push({ op: 'match', i: k, j: k });

  const midA = m - prefix - suffix;
  const midB = n - prefix - suffix;
  let degraded = false;

  if (midA > 0 && midB > 0 && (midA + 1) * (midB + 1) > cellBudget) {
    degraded = true;
    const common = Math.min(midA, midB);
    for (let k = 0; k < common; k++) {
      const i = prefix + k;
      const j = prefix + k;
      // A positional zip may line up two different items. Report those as a
      // delete plus an insert, never as a match: the text path renders a match
      // as unchanged without looking at it again.
      if (a[i] === b[j]) ops.push({ op: 'match', i, j });
      else {
        ops.push({ op: 'del', i });
        ops.push({ op: 'add', j });
      }
    }
    for (let k = common; k < midA; k++) ops.push({ op: 'del', i: prefix + k });
    for (let k = common; k < midB; k++) ops.push({ op: 'add', j: prefix + k });
  } else if (midA === 0) {
    for (let k = 0; k < midB; k++) ops.push({ op: 'add', j: prefix + k });
  } else if (midB === 0) {
    for (let k = 0; k < midA; k++) ops.push({ op: 'del', i: prefix + k });
  } else {
    lcsOps(a, b, prefix, midA, midB, ops);
  }

  for (let k = 0; k < suffix; k++) {
    ops.push({ op: 'match', i: m - suffix + k, j: n - suffix + k });
  }
  return { ops, degraded };
}

/** LCS over `a[prefix..prefix+midA)` and `b[prefix..prefix+midB)`, appended to `out`. */
function lcsOps(a: string[], b: string[], prefix: number, midA: number, midB: number, out: AlignOp[]) {
  const ids = new Map<string, number>();
  const intern = (s: string) => {
    let id = ids.get(s);
    if (id === undefined) {
      id = ids.size;
      ids.set(s, id);
    }
    return id;
  };
  const ta = new Int32Array(midA);
  const tb = new Int32Array(midB);
  for (let k = 0; k < midA; k++) ta[k] = intern(a[prefix + k]);
  for (let k = 0; k < midB; k++) tb[k] = intern(b[prefix + k]);

  // One flat Int32Array: 4 bytes a cell instead of a boxed number plus per-row
  // object overhead, which is what makes a multi-million-cell table practical.
  const width = midB + 1;
  const dp = new Int32Array((midA + 1) * width);
  for (let i = 1; i <= midA; i++) {
    const row = i * width;
    const prev = row - width;
    const ai = ta[i - 1];
    for (let j = 1; j <= midB; j++) {
      dp[row + j] = ai === tb[j - 1] ? dp[prev + j - 1] + 1 : Math.max(dp[prev + j], dp[row + j - 1]);
    }
  }

  // Backtrack, pushing and reversing rather than unshifting (which is O(n) per
  // call and made assembling a large edit script quadratic on its own).
  const reversed: AlignOp[] = [];
  let i = midA;
  let j = midB;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ta[i - 1] === tb[j - 1]) {
      reversed.push({ op: 'match', i: prefix + i - 1, j: prefix + j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i * width + j - 1] >= dp[(i - 1) * width + j])) {
      reversed.push({ op: 'add', j: prefix + j - 1 });
      j--;
    } else {
      reversed.push({ op: 'del', i: prefix + i - 1 });
      i--;
    }
  }
  for (let k = reversed.length - 1; k >= 0; k--) out.push(reversed[k]);
}
