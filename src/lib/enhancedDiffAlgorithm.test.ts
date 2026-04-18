import { describe, it, expect } from 'vitest';
import { computeEnhancedDiff, DiffOptions } from './enhancedDiffAlgorithm';
import type { NoiseRule } from './noiseRules';

describe('computeEnhancedDiff — DiffOptions.ignorePaths regression', () => {
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
