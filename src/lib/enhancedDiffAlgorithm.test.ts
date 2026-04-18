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
  // Regression: after the noise-aware-wedge work threaded `rules` through
  // computeEnhancedDiff, the existing DiffOptions.ignorePaths feature must
  // continue to silently strip ignored paths from the diff.
  //
  // Note: the existing implementation matches paths in the form `parent.key`
  // (no leading `$.`), and the rule format `$.parent.key` strips the `$`
  // and keeps the `.` — this is the pre-existing behavior we preserve.
  it('strips a nested ignorePaths match before diff', () => {
    const left = JSON.stringify({ user: { id: 1, traceId: 'A', name: 'foo' } }, null, 2);
    const right = JSON.stringify({ user: { id: 2, traceId: 'B', name: 'foo' } }, null, 2);
    const options: DiffOptions = { ignorePaths: ['user.traceId'] };
    const result = computeEnhancedDiff(left, right, options);

    const allLines = [...result.left, ...result.right].map((l) => l.content).join('\n');
    expect(allLines).not.toContain('traceId');
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

    // ignorePaths still strips traceId from the diff
    const allLines = [...result.left, ...result.right].map((l) => l.content).join('\n');
    expect(allLines).not.toContain('traceId');
    // Rule marker is injected on the id line (not stripped — DiffOptions
    // and noise rules are independent systems)
    expect(allLines).toContain('NOISE:uuid:rule');
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
    const allLines = [...result.left, ...result.right].map((l) => l.content).join('\n');
    expect(allLines).not.toContain('secret');
  });
});
