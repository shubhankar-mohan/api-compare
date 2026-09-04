/**
 * Tier-3 regressions: statistics that contradict the panes, array identity
 * failures, comparison options that never reach the rendered diff, and two
 * rendering defects.
 */
import { describe, it, expect } from 'vitest';
import { computeDiff } from './diffAlgorithm';
import { computeEnhancedDiff } from './enhancedDiffAlgorithm';
import { computeCharDiff } from './inlineSegments';

// ── I · one changed field should cost one row, not a whole record ─────────

describe('I: array elements pair up when identity is missing or is the change', () => {
  const t = (name: string, l: unknown, r: unknown, add: number, rem: number) =>
    it(name, () => {
      const d = computeDiff(JSON.stringify(l), JSON.stringify(r));
      expect({ additions: d.additions, removals: d.removals }, name).toEqual({
        additions: add,
        removals: rem,
      });
    });

  t(
    'id field not in the candidate list',
    { data: [{ user_id: 1, score: 10 }, { user_id: 2, score: 20 }] },
    { data: [{ user_id: 1, score: 10 }, { user_id: 2, score: 21 }] },
    1, 1
  );
  t(
    'the candidate field IS the changed field',
    { users: [{ name: 'Alice', role: 'admin' }] },
    { users: [{ name: 'Alicia', role: 'admin' }] },
    1, 1
  );
  t(
    'nested arrays of scalars',
    { m: [[1, 2, 3], [4, 5, 6]] },
    { m: [[1, 2, 3], [4, 55, 6]] },
    1, 1
  );
  t(
    'error detail records keyed by nothing stable',
    { details: [{ field: 'phone', code: 'TOO_SHORT' }] },
    { details: [{ field: 'phone', code: 'INVALID_CC' }] },
    1, 1
  );

  it('genuinely different elements still read as add + remove', () => {
    const d = computeDiff(
      JSON.stringify({ xs: [{ a: 1, b: 2, c: 3 }] }),
      JSON.stringify({ xs: [{ z: 9, y: 8, x: 7 }] })
    );
    expect(d.additions).toBeGreaterThan(1);
  });

  it('an inserted element is still exactly one element', () => {
    const rec = (id: string) => ({ orderId: id, qty: 1 });
    const d = computeDiff(
      JSON.stringify({ d: [rec('2'), rec('3')] }),
      JSON.stringify({ d: [rec('1'), rec('2'), rec('3')] })
    );
    expect(d.removals).toBe(0);
    expect(d.additions).toBe(4); // {, orderId, qty, }
  });
});

// ── E · statistics must agree with the rendered panes ────────────────────

describe('E: statistics agree with what the user is looking at', () => {
  it('an array insert does not read as 100% changed', () => {
    const rec = (id: string, qty: number) => ({ orderId: id, qty, sku: `SKU-${id}` });
    const l = { data: [rec('1001', 2), rec('1002', 1), rec('1003', 5)] };
    const r = { data: [rec('1000', 3), rec('1001', 2), rec('1002', 7), rec('1003', 5)] };
    const e = computeEnhancedDiff(JSON.stringify(l), JSON.stringify(r), { advancedMode: true });
    expect(e.statistics.percentageChanged, 'stats contradict the diff').toBeLessThan(60);
  });

  it('ancestor containers are not counted as changed keys', () => {
    // A single-leaf document really is 100% changed, so the percentage is not
    // the tell here — the bug was counting a, b and c as changed alongside d.
    const deep = computeEnhancedDiff('{"a":{"b":{"c":{"d":1}}}}', '{"a":{"b":{"c":{"d":2}}}}', {
      advancedMode: true,
    });
    expect(deep.statistics.changedKeys, 'ancestor containers counted as changed').toBe(1);
    expect(deep.statistics.totalKeys).toBe(1);

    // With siblings present the percentage becomes meaningful again.
    const withSiblings = computeEnhancedDiff(
      '{"a":{"b":{"c":{"d":1}}},"x":1,"y":2,"z":3}',
      '{"a":{"b":{"c":{"d":2}}},"x":1,"y":2,"z":3}',
      { advancedMode: true }
    );
    expect(withSiblings.statistics.changedKeys).toBe(1);
    expect(withSiblings.statistics.totalKeys).toBe(4);
    expect(withSiblings.statistics.percentageChanged).toBe(25);
  });

  it('dotted key names are counted, not skipped', () => {
    const e = computeEnhancedDiff('{"a.b":1}', '{"a.b":999}', { advancedMode: true });
    expect(e.additions).toBe(1);
    expect(e.statistics.changedKeys, 'visible diff but zero changed keys').toBe(1);
  });

  it('identical documents report their real key count', () => {
    const doc = JSON.stringify({ a: 1, b: { c: 2 } });
    const e = computeEnhancedDiff(doc, doc, { advancedMode: true });
    expect(e.statistics.totalKeys).toBeGreaterThan(0);
  });
});

// ── H-4 / M-1 · options in the UI must affect the rendered diff ───────────

describe('H4: comparison toggles reach the rendered diff', () => {
  it('semanticComparison treats "5" and 5 as equal', () => {
    const e = computeEnhancedDiff('{"qty":"5"}', '{"qty":5}', {
      semanticComparison: true,
      advancedMode: true,
    });
    expect(e.hasDifferences).toBe(false);
  });

  it('ignoreCase', () => {
    const e = computeEnhancedDiff('{"s":"FULFILLED"}', '{"s":"fulfilled"}', {
      ignoreCase: true,
      advancedMode: true,
    });
    expect(e.hasDifferences).toBe(false);
  });

  it('ignoreWhitespace', () => {
    const e = computeEnhancedDiff('{"m":"order   created"}', '{"m":"order created"}', {
      ignoreWhitespace: true,
      advancedMode: true,
    });
    expect(e.hasDifferences).toBe(false);
  });

  it('off by default', () => {
    expect(computeEnhancedDiff('{"qty":"5"}', '{"qty":5}', { advancedMode: true }).hasDifferences).toBe(true);
  });
});

describe('M1: ignorePaths accepts the form the UI documents', () => {
  it('$.user.id (the documented form) works', () => {
    const e = computeEnhancedDiff('{"user":{"id":"a"},"v":1}', '{"user":{"id":"b"},"v":1}', {
      ignorePaths: ['$.user.id'],
    });
    expect(e.hasDifferences).toBe(false);
  });

  it('the bare form keeps working', () => {
    const e = computeEnhancedDiff('{"user":{"id":"a"},"v":1}', '{"user":{"id":"b"},"v":1}', {
      ignorePaths: ['user.id'],
    });
    expect(e.hasDifferences).toBe(false);
  });

  it('does not over-ignore', () => {
    const e = computeEnhancedDiff('{"user":{"id":"a"},"v":1}', '{"user":{"id":"a"},"v":2}', {
      ignorePaths: ['$.user.id'],
    });
    expect(e.hasDifferences).toBe(true);
  });
});

// ── rendering defects ────────────────────────────────────────────────────

describe('inline segments do not split surrogate pairs', () => {
  it('two different emoji produce whole-codepoint segments', () => {
    const { leftSegments, rightSegments } = computeCharDiff('alert: 🚨 ok', 'alert: 🚀 ok');
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    for (const seg of [...leftSegments, ...rightSegments]) {
      expect(lone.test(seg.text), `lone surrogate in ${JSON.stringify(seg.text)}`).toBe(false);
    }
  });

  it('skin-tone modifiers survive', () => {
    const { leftSegments } = computeCharDiff('👍🏽 yes', '👍🏻 yes');
    expect(leftSegments.map((s) => s.text).join('')).toBe('👍🏽 yes');
  });
});
