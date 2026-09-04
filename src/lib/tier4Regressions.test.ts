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
