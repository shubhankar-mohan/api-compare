/**
 * Tier-4 regressions: Diff Options reaching array element identity, inline
 * highlight quality, and similarity scoring.
 */
import { describe, it, expect } from 'vitest';
import { computeJsonTreeDiff } from './jsonTreeDiff';
import { calculateSimilarity, clearSimilarityCache } from './inlineSegments';

// ── A · options apply to array elements exactly as they do to object fields ─

describe('A: Diff Options reach array element identity', () => {
  it('semantic comparison: ["1","2","3"] vs [1,2,3] has no differences', () => {
    const d = computeJsonTreeDiff(['1', '2', '3'], [1, 2, 3], { semanticComparison: true });
    expect(d.hasDifferences, 'array of scalars ignored semanticComparison').toBe(false);
    expect(d.additions + d.removals).toBe(0);
  });

  it('semantic comparison: the same values as object fields agree with the array verdict', () => {
    const obj = computeJsonTreeDiff({ a: '1', b: '2' }, { a: 1, b: 2 }, { semanticComparison: true });
    const arr = computeJsonTreeDiff(['1', '2'], [1, 2], { semanticComparison: true });
    expect(arr.hasDifferences).toBe(obj.hasDifferences);
  });

  it('semantic comparison off: ["1"] vs [1] is still a difference (I2)', () => {
    const d = computeJsonTreeDiff(['1'], [1]);
    expect(d.hasDifferences).toBe(true);
  });

  it('ignore case: ["Foo","Bar"] vs ["foo","bar"] has no differences', () => {
    const d = computeJsonTreeDiff(['Foo', 'Bar'], ['foo', 'bar'], { ignoreCase: true });
    expect(d.hasDifferences).toBe(false);
  });

  it('ignore whitespace: ["a  b"] vs ["a b"] has no differences', () => {
    const d = computeJsonTreeDiff(['a  b'], ['a b'], { ignoreWhitespace: true });
    expect(d.hasDifferences).toBe(false);
  });

  it('ignore case: keyless records that differ only by case align as the same record', () => {
    // Without normalization the identity tokens differ, the LCS finds no
    // match, and a one-field edit elsewhere renders as remove-all / add-all.
    const left = [
      { n: 'Foo', qty: 1 },
      { n: 'Bar', qty: 2 },
    ];
    const right = [
      { n: 'foo', qty: 1 },
      { n: 'bar', qty: 3 },
    ];
    const d = computeJsonTreeDiff(left, right, { ignoreCase: true });
    // Only `qty` on the second record changed: one modified row on each side.
    expect(d.additions).toBe(1);
    expect(d.removals).toBe(1);
  });

  it('rendering still shows what each side sent', () => {
    const d = computeJsonTreeDiff(['Foo'], ['foo'], { ignoreCase: true });
    expect(d.left.map((l) => l.content).join('\n')).toContain('"Foo"');
    expect(d.right.map((l) => l.content).join('\n')).toContain('"foo"');
  });
});

// ── B · inline highlight covers the value, not the shared key prefix ───────

describe('B: inline segments are computed on the value span', () => {
  const modifiedRow = (left: unknown, right: unknown) => {
    const d = computeJsonTreeDiff(left, right);
    const i = d.left.findIndex((l) => l.type === 'modified');
    expect(i, 'no modified row').toBeGreaterThanOrEqual(0);
    return { l: d.left[i], r: d.right[i] };
  };
  const texts = (segs: { text: string; type: string }[] | undefined, type: string) =>
    (segs ?? []).filter((s) => s.type === type).map((s) => s.text);

  it('unrelated string values are replaced whole, not scattered by character', () => {
    const { l, r } = modifiedRow({ name: 'Leanne Graham' }, { name: 'Ervin Howell' });
    expect(texts(l.segments, 'removed')).toEqual(['"Leanne Graham"']);
    expect(texts(r.segments, 'added')).toEqual(['"Ervin Howell"']);
  });

  it('a one-character change in a similar value highlights just that character', () => {
    const { l, r } = modifiedRow({ at: '2024-01-01T10:00:00Z' }, { at: '2024-01-02T10:00:00Z' });
    expect(texts(l.segments, 'removed')).toEqual(['1']);
    expect(texts(r.segments, 'added')).toEqual(['2']);
  });

  it('numbers are replaced whole', () => {
    const { l, r } = modifiedRow({ total: 100 }, { total: 250 });
    expect(texts(l.segments, 'removed')).toEqual(['100']);
    expect(texts(r.segments, 'added')).toEqual(['250']);
  });

  it('the key prefix and the trailing comma are never highlighted', () => {
    const { l, r } = modifiedRow({ a: 'x', b: 1 }, { a: 'y', b: 1 });
    expect(texts(l.segments, 'removed')).toEqual(['"x"']);
    expect(texts(r.segments, 'added')).toEqual(['"y"']);
    expect(l.content.endsWith(',')).toBe(true);
  });

  it('segments concatenate back to the rendered row (I1 for segments)', () => {
    const { l, r } = modifiedRow({ a: 'x', b: 1 }, { a: 'y', b: 1 });
    expect((l.segments ?? []).map((s) => s.text).join('')).toBe(l.content);
    expect((r.segments ?? []).map((s) => s.text).join('')).toBe(r.content);
  });
});

// ── C · similarity scores are correct, cached or not ───────────────────────

describe('C: calculateSimilarity is not fooled by its own cache', () => {
  const head = 'A'.repeat(50);
  const tail = 'Z'.repeat(50);
  const base = head + 'x'.repeat(100) + tail;

  it('two lines that differ only in the middle do not share a cached score', () => {
    clearSimilarityCache();
    const allDifferent = head + 'y'.repeat(100) + tail;
    const oneChar = head + 'x'.repeat(99) + 'q' + tail;
    expect(calculateSimilarity(base, allDifferent)).toBeCloseTo(0.5, 1);
    // Same length, same first 50, same last 50 as `allDifferent` — the old
    // sampled cache key collided and returned 0.5 for a near-identical pair.
    expect(calculateSimilarity(base, oneChar)).toBeGreaterThan(0.99);
  });

  it('a half-changed middle scores 0.75, not the score of an earlier collision', () => {
    clearSimilarityCache();
    calculateSimilarity(base, head + 'y'.repeat(100) + tail);
    const halfChanged = head + 'x'.repeat(50) + 'y'.repeat(50) + tail;
    expect(calculateSimilarity(base, halfChanged)).toBeCloseTo(0.75, 1);
  });

  it('lines beyond the Levenshtein cap are scored on their sampled ends, not inflated', () => {
    clearSimilarityCache();
    const common = 'c'.repeat(1700);
    const a = 'A'.repeat(300) + common;
    const b = 'B'.repeat(300) + common;
    // The start differs entirely and the end is identical; the old formula
    // divided a capped distance by the full length and reported 0.85.
    expect(calculateSimilarity(a, b)).toBeCloseTo(0.5, 1);
  });

  it('identical long lines still score 1 and unrelated long lines still score ~0', () => {
    clearSimilarityCache();
    const a = 'a'.repeat(2000);
    expect(calculateSimilarity(a, 'a'.repeat(2000))).toBe(1);
    expect(calculateSimilarity(a, 'b'.repeat(2000))).toBeLessThan(0.05);
  });
});

// ── D · pairing inside a delete/insert run is by similarity, in order ──────

describe('D: edits inside a delete/insert run pair by similarity, preserving order', () => {
  const readBack = (rows: { type: string; content: string }[]) =>
    JSON.parse(rows.filter((l) => l.type !== 'empty').map((l) => l.content).join('\n'));
  const count = (rows: { type: string }[], type: string) => rows.filter((l) => l.type === type).length;

  it('a removed record before an edited one no longer hides the edit', () => {
    // Positional pairing matched A with B' and B with C, both below the
    // threshold, so all four records rendered whole with no inline highlight.
    const left = [
      { n: 'a', p: 1, q: 1, r: 1 },
      { n: 'b', p: 2, q: 2, r: 2 },
    ];
    const right = [
      { n: 'b', p: 2, q: 2, r: 3 },
      { n: 'c', p: 9, q: 9, r: 9 },
    ];
    const d = computeJsonTreeDiff(left, right);
    expect(count(d.left, 'modified'), 'the b→b edit should be one modified row').toBe(1);
    expect(count(d.left, 'removed'), 'record a removed whole').toBe(6);
    expect(count(d.right, 'added'), 'record c added whole').toBe(6);
    expect(readBack(d.left)).toEqual(left);
    expect(readBack(d.right)).toEqual(right);
  });

  it('a swap with edits keeps each pane in its own order (I1) and still finds one edit', () => {
    const left = [
      { n: 'a', p: 1, q: 1, r: 1 },
      { n: 'b', p: 2, q: 2, r: 2 },
    ];
    const right = [
      { n: 'b', p: 2, q: 2, r: 3 },
      { n: 'a', p: 1, q: 1, r: 9 },
    ];
    const d = computeJsonTreeDiff(left, right);
    expect(count(d.left, 'modified')).toBe(1);
    expect(readBack(d.left)).toEqual(left);
    expect(readBack(d.right)).toEqual(right);
  });

  it('positionally aligned edits still pair one to one', () => {
    const left = [
      { n: 'a', p: 1, q: 1, r: 1 },
      { n: 'b', p: 2, q: 2, r: 2 },
    ];
    const right = [
      { n: 'a', p: 1, q: 1, r: 8 },
      { n: 'b', p: 2, q: 2, r: 9 },
    ];
    const d = computeJsonTreeDiff(left, right);
    expect(count(d.left, 'modified')).toBe(2);
    expect(d.additions).toBe(2);
    expect(d.removals).toBe(2);
  });

  it('a very long run of unrelated records stays fast', () => {
    const left = Array.from({ length: 3000 }, (_, i) => ({ n: `l${i}`, v: i }));
    const right = Array.from({ length: 3000 }, (_, i) => ({ n: `r${i}`, v: -i }));
    const t0 = Date.now();
    computeJsonTreeDiff(left, right);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});
