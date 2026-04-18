import { describe, it, expect, beforeEach } from 'vitest';
import { computeEnhancedDiff, __test as enhancedTest } from './enhancedDiffAlgorithm';

describe('enhancedDiffAlgorithm', () => {
  // ──────────────────────────────────────────────
  // computeDiffStatistics gating at large input sizes
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
  // deepEqualCache eviction
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
