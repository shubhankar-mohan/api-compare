/**
 * Tier-4 regressions: Diff Options reaching array element identity, inline
 * highlight quality, and similarity scoring.
 */
import { describe, it, expect } from 'vitest';
import { computeJsonTreeDiff } from './jsonTreeDiff';

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
