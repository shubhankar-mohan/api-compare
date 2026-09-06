import { describe, it, expect, beforeEach } from 'vitest';
import { computeEnhancedDiff, DiffOptions, __test as enhancedTest } from './enhancedDiffAlgorithm';
import type { NoiseRule } from './noiseRules';

describe('enhancedDiffAlgorithm', () => {
  // ──────────────────────────────────────────────
  // computeDiffStatistics gating at large input sizes (Lane B)
  // ──────────────────────────────────────────────
  describe('statistics.skipped at large sizes', () => {
    it('marks stats.skipped=true when input exceeds 3000 lines', () => {
      // Build an array of objects large enough that JSON.stringify(_, null, 2)
      // produces > 3000 lines. ~600 objects * 6 fields ~= ~5000 lines.
      const makeArr = (prefix: string, n = 600, fields = 6) => {
        const arr: Array<Record<string, string>> = [];
        for (let i = 0; i < n; i++) {
          const o: Record<string, string> = {};
          for (let f = 0; f < fields; f++) o[`f_${f}`] = `${prefix}_${i}_${f}`;
          arr.push(o);
        }
        return JSON.stringify(arr, null, 2);
      };

      const left = makeArr('L');
      const right = makeArr('R');

      const lineCount = left.split('\n').length;
      // Sanity: ensure the synthetic input crosses the gate threshold (3000).
      expect(lineCount).toBeGreaterThan(3000);

      const result = computeEnhancedDiff(left, right);

      expect(result.statistics.skipped).toBe(true);
      // Skipped stats should be zeroed.
      expect(result.statistics.totalKeys).toBe(0);
      expect(result.statistics.changedKeys).toBe(0);
      expect(result.statistics.percentageChanged).toBe(0);
    }, 30000);

    it('does NOT set stats.skipped on small inputs', () => {
      const left = JSON.stringify({ a: 1, b: 'x' }, null, 2);
      const right = JSON.stringify({ a: 1, b: 'y' }, null, 2);

      const result = computeEnhancedDiff(left, right);

      expect(result.statistics.skipped).toBeUndefined();
      expect(result.statistics.totalKeys).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────
  // deepEqualCache eviction (Lane B)
  // ──────────────────────────────────────────────
  describe('deepEqualCache eviction', () => {
    beforeEach(() => {
      enhancedTest.clearDeepEqualCache();
    });

    it('never exceeds DEEPEQUAL_CACHE_CAP after many distinct primitive comparisons', () => {
      const cap = enhancedTest.DEEPEQUAL_CACHE_CAP;
      // Run 2x cap distinct primitive comparisons (each populates one new
      // cache entry because the path+JSON-encoded values are all unique).
      for (let i = 0; i < cap * 2; i++) {
        // Distinct path component prevents key collisions.
        enhancedTest.deepEqual(`val_${i}_a`, `val_${i}_b`, {}, `path_${i}`);
      }

      const size = enhancedTest.deepEqualCacheSize();
      expect(size).toBeLessThanOrEqual(cap);
      // Eviction drops half on overflow, so size must also be > 0 after evicts
      // (otherwise eviction is too aggressive).
      expect(size).toBeGreaterThan(0);
    }, 30000);

    it('returns the cached verdict on repeat lookups', () => {
      // Populate then re-check with the SAME path+values; should hit cache.
      const verdict1 = enhancedTest.deepEqual('hello', 'hello', {}, 'k');
      const verdict2 = enhancedTest.deepEqual('hello', 'hello', {}, 'k');
      expect(verdict1).toBe(true);
      expect(verdict2).toBe(true);

      const verdict3 = enhancedTest.deepEqual('hello', 'world', {}, 'k2');
      const verdict4 = enhancedTest.deepEqual('hello', 'world', {}, 'k2');
      expect(verdict3).toBe(false);
      expect(verdict4).toBe(false);
    });
  });
});

describe('computeEnhancedDiff — DiffOptions.ignorePaths regression (Lane A)', () => {
  // ignorePaths used to strip the member from both documents before the
  // diff. It now behaves like a noise rule: the member is still rendered (so
  // the pane reads back as the response) but greyed and not counted. Both the
  // bare `parent.key` form and `$.parent.key` are accepted.
  it('marks a nested ignorePaths match as ignored instead of stripping it', () => {
    const left = JSON.stringify({ user: { id: 1, traceId: 'A', name: 'foo' } }, null, 2);
    const right = JSON.stringify({ user: { id: 2, traceId: 'B', name: 'foo' } }, null, 2);
    const options: DiffOptions = { ignorePaths: ['user.traceId'] };
    const result = computeEnhancedDiff(left, right, options);

    const traceRow = result.right.find((l) => l.content.includes('traceId'));
    expect(traceRow?.type).toBe('unchanged');
    expect(traceRow?.noise).toEqual({ type: 'ignored', source: 'option' });
  });

  it('still surfaces real changes when ignorePaths is set', () => {
    const left = JSON.stringify({ user: { id: 1, traceId: 'A', name: 'foo' } }, null, 2);
    const right = JSON.stringify({ user: { id: 2, traceId: 'B', name: 'foo' } }, null, 2);
    const options: DiffOptions = { ignorePaths: ['user.traceId'] };
    const result = computeEnhancedDiff(left, right, options);

    expect(result.hasDifferences).toBe(true);
    // id changed from 1 to 2 — should still show
    const ids = [...result.left, ...result.right].filter((l) => l.content.includes('"id"'));
    expect(ids.length).toBeGreaterThan(0);
  });

  it('rules param is independent of ignorePaths (both can be set)', () => {
    const left = JSON.stringify({ user: { id: 1, traceId: 'A', name: 'foo' } }, null, 2);
    const right = JSON.stringify({ user: { id: 2, traceId: 'B', name: 'foo' } }, null, 2);
    const options: DiffOptions = { ignorePaths: ['user.traceId'] };
    const rules: NoiseRule[] = [
      { path: '$..id', type: 'uuid', source: 'manual', createdAt: 1 },
    ];
    const result = computeEnhancedDiff(left, right, options, rules);

    // ignorePaths still suppresses traceId, out-of-band
    const allLines = [...result.left, ...result.right].map((l) => l.content).join('\n');
    const traceRow = result.right.find((l) => l.content.includes('traceId'));
    expect(traceRow?.noise).toEqual({ type: 'ignored', source: 'option' });

    // The rule is reported on the line object, not encoded into the rendered
    // text. Metadata inside `content` was forgeable by any API response, so
    // it now travels out-of-band; `content` is verbatim server output.
    expect(allLines).not.toContain('NOISE:');
    const idRow = result.right.find((l) => (l.content || '').includes('"id"'));
    expect(idRow?.noise).toEqual({ type: 'uuid', source: 'rule' });
    // ...and suppression means it is genuinely not counted.
    expect(result.hasDifferences).toBe(false);
  });

  it('omitting rules behaves identically to passing []', () => {
    const left = JSON.stringify({ id: 1, name: 'foo' }, null, 2);
    const right = JSON.stringify({ id: 2, name: 'foo' }, null, 2);
    const result1 = computeEnhancedDiff(left, right, {});
    const result2 = computeEnhancedDiff(left, right, {}, []);
    expect(result1.left.length).toBe(result2.left.length);
    expect(result1.right.length).toBe(result2.right.length);
    expect(result1.hasDifferences).toBe(result2.hasDifferences);
  });

  it('ignoreKeys option still works after rules integration', () => {
    const left = JSON.stringify({ id: 1, secret: 'A', name: 'foo' }, null, 2);
    const right = JSON.stringify({ id: 1, secret: 'B', name: 'foo' }, null, 2);
    const options: DiffOptions = { ignoreKeys: ['secret'] };
    const result = computeEnhancedDiff(left, right, options);
    const secretRow = result.right.find((l) => l.content.includes('secret'));
    expect(secretRow?.noise).toEqual({ type: 'ignored', source: 'option' });
    expect(result.hasDifferences).toBe(false);
  });
});

// ── Review follow-up: ignore keys/paths behave like noise rules ────────────

describe('ignoreKeys / ignorePaths render, grey and do not count (review follow-up)', () => {
  const left = JSON.stringify({ id: 1, ts: '2024-01-01T00:00:00Z', name: 'a' }, null, 2);
  const right = JSON.stringify({ id: 1, ts: '2024-01-02T00:00:00Z', name: 'a' }, null, 2);
  const readBack = (rows: { type: string; content: string }[]) =>
    JSON.parse(rows.filter((l) => l.type !== 'empty').map((l) => l.content).join('\n'));

  it('an ignored key is still rendered on both panes, so the pane reads back as the response', () => {
    const d = computeEnhancedDiff(left, right, { ignoreKeys: ['ts'] });
    expect(readBack(d.left)).toEqual(JSON.parse(left));
    expect(readBack(d.right)).toEqual(JSON.parse(right));
  });

  it('an ignored key is marked as noise from the options and not counted', () => {
    const d = computeEnhancedDiff(left, right, { ignoreKeys: ['ts'] });
    const row = d.right.find((l) => l.content.includes('"ts"'));
    expect(row?.noise).toEqual({ type: 'ignored', source: 'option' });
    expect(d.hasDifferences).toBe(false);
    expect(d.additions + d.removals).toBe(0);
    expect(d.statistics.percentageChanged).toBe(0);
  });

  it('an ignored path in the documented $.path form works, at any depth with $..', () => {
    const l = JSON.stringify({ a: { ts: 1 }, b: { ts: 1 } });
    const r = JSON.stringify({ a: { ts: 2 }, b: { ts: 3 } });
    expect(computeEnhancedDiff(l, r, { ignorePaths: ['$.a.ts'] }).hasDifferences).toBe(true);
    expect(computeEnhancedDiff(l, r, { ignorePaths: ['$.a.ts', '$.b.ts'] }).hasDifferences).toBe(false);
    expect(computeEnhancedDiff(l, r, { ignorePaths: ['$..ts'] }).hasDifferences).toBe(false);
    expect(computeEnhancedDiff(l, r, { ignorePaths: ['a.ts', 'b.ts'] }).hasDifferences).toBe(false);
  });

  it('a real change elsewhere is still reported with an ignore active', () => {
    const d = computeEnhancedDiff(left, right.replace('"name": "a"', '"name": "b"'), { ignoreKeys: ['ts'] });
    expect(d.hasDifferences).toBe(true);
    expect(d.additions).toBe(1);
  });
});
