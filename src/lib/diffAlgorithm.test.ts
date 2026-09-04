import { describe, it, expect } from 'vitest';
import { computeDiff, formatJson, clearSimilarityCache } from './diffAlgorithm';
import { computeEnhancedDiff } from './enhancedDiffAlgorithm';
import type { NoiseRule } from './noiseRules';

describe('diffAlgorithm', () => {
  // ──────────────────────────────────────────────
  // formatJson
  // ──────────────────────────────────────────────
  describe('formatJson', () => {
    it('formats valid JSON with indentation', () => {
      const result = formatJson('{"name":"test","age":30}');
      expect(result).toBe('{\n  "name": "test",\n  "age": 30\n}');
    });

    it('returns original text for invalid JSON', () => {
      const result = formatJson('not json');
      expect(result).toBe('not json');
    });

    it('handles empty object', () => {
      const result = formatJson('{}');
      expect(result).toBe('{}');
    });

    it('handles arrays', () => {
      const result = formatJson('[1,2,3]');
      expect(result).toBe('[\n  1,\n  2,\n  3\n]');
    });

    it('handles nested JSON', () => {
      const result = formatJson('{"a":{"b":1}}');
      const parsed = JSON.parse(result);
      expect(parsed.a.b).toBe(1);
    });
  });

  // ──────────────────────────────────────────────
  // computeDiff - identical content
  // ──────────────────────────────────────────────
  describe('computeDiff - identical', () => {
    it('returns no differences for identical strings', () => {
      const result = computeDiff('hello\nworld', 'hello\nworld');
      expect(result.hasDifferences).toBe(false);
      expect(result.additions).toBe(0);
      expect(result.removals).toBe(0);
    });

    it('returns no differences for identical JSON', () => {
      const json = '{\n  "name": "test"\n}';
      const result = computeDiff(json, json);
      expect(result.hasDifferences).toBe(false);
    });

    it('returns no differences for empty strings', () => {
      const result = computeDiff('', '');
      expect(result.hasDifferences).toBe(false);
    });
  });

  // ──────────────────────────────────────────────
  // computeDiff - differences
  // ──────────────────────────────────────────────
  describe('computeDiff - differences', () => {
    it('detects added lines', () => {
      const result = computeDiff('line1', 'line1\nline2');
      expect(result.hasDifferences).toBe(true);
      expect(result.additions).toBeGreaterThan(0);
    });

    it('detects removed lines', () => {
      const result = computeDiff('line1\nline2', 'line1');
      expect(result.hasDifferences).toBe(true);
      expect(result.removals).toBeGreaterThan(0);
    });

    it('detects modified lines', () => {
      const result = computeDiff(
        '{\n  "name": "old"\n}',
        '{\n  "name": "new"\n}'
      );
      expect(result.hasDifferences).toBe(true);
    });

    it('handles completely different content', () => {
      const result = computeDiff('alpha\nbeta\ngamma', 'one\ntwo\nthree');
      expect(result.hasDifferences).toBe(true);
    });
  });

  // ──────────────────────────────────────────────
  // Performance: large inputs must NOT crash
  // ──────────────────────────────────────────────
  describe('performance - large inputs', () => {
    it('does not crash on 2000-line JSON diff', () => {
      clearSimilarityCache();

      // Generate large JSON objects with different values
      const makeJson = (prefix: string, count: number) => {
        const obj: Record<string, any> = {};
        for (let i = 0; i < count; i++) {
          obj[`key_${i}`] = `${prefix}_value_${i}`;
        }
        return JSON.stringify(obj, null, 2);
      };

      const left = makeJson('left', 500);
      const right = makeJson('right', 500);

      const start = Date.now();
      const result = computeDiff(left, right);
      const elapsed = Date.now() - start;

      // Should complete in under 5 seconds (generous limit)
      expect(elapsed).toBeLessThan(5000);
      expect(result.hasDifferences).toBe(true);
      expect(result.left.length).toBeGreaterThan(0);
      expect(result.right.length).toBeGreaterThan(0);
    });

    it('does not crash on 3000-line text diff', () => {
      clearSimilarityCache();

      const makeText = (prefix: string, lines: number) =>
        Array.from({ length: lines }, (_, i) => `${prefix} line number ${i}: some content here`).join('\n');

      const left = makeText('LEFT', 3000);
      const right = makeText('RIGHT', 3000);

      const start = Date.now();
      const result = computeDiff(left, right);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(5000);
      expect(result.hasDifferences).toBe(true);
    });

    it('handles one side empty, other side large', () => {
      const large = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join('\n');
      const result = computeDiff('', large);
      expect(result.hasDifferences).toBe(true);
      expect(result.additions).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────
  // JSON structural diff
  // ──────────────────────────────────────────────
  describe('JSON diff', () => {
    it('detects value changes in JSON', () => {
      const left = formatJson('{"status":"active","count":10}');
      const right = formatJson('{"status":"inactive","count":10}');
      const result = computeDiff(left, right);
      expect(result.hasDifferences).toBe(true);
    });

    it('detects added keys in JSON', () => {
      const left = formatJson('{"a":1}');
      const right = formatJson('{"a":1,"b":2}');
      const result = computeDiff(left, right);
      expect(result.hasDifferences).toBe(true);
    });

    it('detects removed keys in JSON', () => {
      const left = formatJson('{"a":1,"b":2}');
      const right = formatJson('{"a":1}');
      const result = computeDiff(left, right);
      expect(result.hasDifferences).toBe(true);
    });

    it('treats identical JSON with different formatting as same', () => {
      const left = '{\n  "name":   "test"\n}';
      const right = '{\n  "name": "test"\n}';
      const result = computeDiff(left, right);
      expect(result.hasDifferences).toBe(false);
    });
  });

  // ──────────────────────────────────────────────

  // ──────────────────────────────────────────────
  // Performance regression: 10k / 20k line JSON via computeEnhancedDiff (Lane B)
  // ──────────────────────────────────────────────
  describe('performance - enhanced diff at very large sizes', () => {
    // Synthetic JSON: array of N objects with `fieldsPerObj` fields each.
    // ~40% of objects have entirely different field values left vs right.
    const makeRealisticJson = (objectCount: number, fieldsPerObj = 10) => {
      const leftArr: Array<Record<string, string>> = [];
      const rightArr: Array<Record<string, string>> = [];
      for (let i = 0; i < objectCount; i++) {
        const sameObj: Record<string, string> = {};
        const diffObjL: Record<string, string> = {};
        const diffObjR: Record<string, string> = {};
        for (let f = 0; f < fieldsPerObj; f++) {
          sameObj[`field_${f}`] = `value_${i}_${f}`;
          diffObjL[`field_${f}`] = `left_${i}_${f}`;
          diffObjR[`field_${f}`] = `right_${i}_${f}`;
        }
        if (i % 5 < 2) {
          leftArr.push(diffObjL);
          rightArr.push(diffObjR);
        } else {
          leftArr.push(sameObj);
          rightArr.push(sameObj);
        }
      }
      return {
        left: JSON.stringify(leftArr, null, 2),
        right: JSON.stringify(rightArr, null, 2),
      };
    };

    it('completes 10000-line JSON diff under 3s (computeEnhancedDiff)', () => {
      clearSimilarityCache();
      // 1000 objects * 10 fields → ~12k formatted lines
      const { left, right } = makeRealisticJson(1000, 10);

      const start = performance.now();
      const result = computeEnhancedDiff(left, right);
      const elapsed = performance.now() - start;

      // eslint-disable-next-line no-console
      console.log(`[perf 10k] ${elapsed.toFixed(0)}ms (${left.split('\n').length} lines)`);
      expect(elapsed).toBeLessThan(3000);
      expect(result.hasDifferences).toBe(true);
    }, 30000);

    it('completes 20000-line JSON diff under 8s (computeEnhancedDiff)', () => {
      clearSimilarityCache();
      // 2000 objects * 10 fields → ~24k formatted lines
      const { left, right } = makeRealisticJson(2000, 10);

      const start = performance.now();
      const result = computeEnhancedDiff(left, right);
      const elapsed = performance.now() - start;

      // eslint-disable-next-line no-console
      console.log(`[perf 20k] ${elapsed.toFixed(0)}ms (${left.split('\n').length} lines)`);
      expect(elapsed).toBeLessThan(8000);
      expect(result.hasDifferences).toBe(true);
    }, 60000);
  });
});
