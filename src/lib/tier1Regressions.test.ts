/**
 * Regression tests for the defects found during user-simulation testing.
 *
 * Each block names the failure it locks down. These are separate from
 * diffCorrectness.test.ts because they are specific bug reproductions rather
 * than general invariants.
 */
import { describe, it, expect } from 'vitest';
import { computeDiff, formatJson } from './diffAlgorithm';
import { computeEnhancedDiff } from './enhancedDiffAlgorithm';
import { computeJsonTreeDiff, MAX_TREE_DEPTH, DiffDepthExceededError } from './jsonTreeDiff';
import { compileRulePath, isValidRulePath, parseRulesFile, addRule, loadRules, type NoiseRule } from './noiseRules';

const rule = (path: string, type = 'uuid'): NoiseRule[] => [
  { path, type: type as NoiseRule['type'], source: 'manual', createdAt: 1 },
];

// ── A · noise metadata must not travel inside `content` ────────────────────

describe('A: noise metadata is out-of-band', () => {
  it('a forged marker in user data is NOT treated as metadata', () => {
    const left = '{"log":"deploy ok /* NOISE:uuid:rule */ v1"}';
    const right = '{"log":"deploy ok /* NOISE:uuid:rule */ v2"}';
    const d = computeDiff(left, right);

    expect(d.hasDifferences).toBe(true);
    // The row must not be classified as suppressed noise...
    const row = d.left.find((l) => (l.content || '').includes('deploy ok'))!;
    expect(row.noise, 'user data was parsed as noise metadata').toBeUndefined();
    // ...and the value must survive intact.
    expect(row.content).toContain('/* NOISE:uuid:rule */');
    expect(row.content).toContain('v1');
  });

  it('real rule suppression is reported on the line object, not in the text', () => {
    const d = computeDiff('{"traceId":"a"}', '{"traceId":"b"}', { rules: rule('$.traceId') });
    const row = d.right.find((l) => (l.content || '').includes('traceId'))!;
    expect(row.noise).toEqual({ type: 'uuid', source: 'rule' });
    expect(row.content).not.toContain('NOISE:');
    expect(d.hasDifferences).toBe(false);
  });

  it('auto suggestions are on the object and never in the text', () => {
    const d = computeDiff(
      '{"traceId":"550e8400-e29b-41d4-a716-446655440000"}',
      '{"traceId":"660e8400-e29b-41d4-a716-446655440111"}'
    );
    const row = d.right.find((l) => (l.content || '').includes('traceId'))!;
    expect(row.noise?.source).toBe('auto');
    expect(row.content).not.toContain('NOISE:');
  });

  it('panes stay valid JSON when a rule fires (merge/copy correctness)', () => {
    const d = computeDiff('{"t":"a","k":1}', '{"t":"b","k":1}', { rules: rule('$.t', 'trace-id') });
    for (const side of [d.left, d.right]) {
      const text = side.filter((l) => l.type !== 'empty').map((l) => l.content).join('\n');
      expect(() => JSON.parse(text)).not.toThrow();
    }
  });
});

// ── B · depth must fail loudly, not blow the stack ─────────────────────────

describe('B: deep nesting is bounded', () => {
  const deep = (levels: number, v: string) => '{"next":'.repeat(levels) + v + '}'.repeat(levels);

  it('a pathological document throws a typed error, not RangeError', () => {
    const l = formatJson(deep(3000, '1'));
    const r = formatJson(deep(3000, '2'));
    let caught: unknown;
    try {
      computeDiff(l, r);
    } catch (e) {
      caught = e;
    }
    expect(caught, 'expected a typed depth error').toBeInstanceOf(DiffDepthExceededError);
    expect((caught as Error).message).not.toMatch(/call stack/i);
  });

  it('computeEnhancedDiff surfaces the same typed error', () => {
    const l = formatJson(deep(3000, '1'));
    const r = formatJson(deep(3000, '2'));
    expect(() => computeEnhancedDiff(l, r, { advancedMode: true })).toThrow(DiffDepthExceededError);
  });

  it('documents just under the limit still diff correctly', () => {
    const n = MAX_TREE_DEPTH - 4;
    const d = computeJsonTreeDiff(JSON.parse(deep(n, '1')), JSON.parse(deep(n, '2')));
    expect(d.hasDifferences).toBe(true);
    expect(d.additions).toBe(1);
  });
});

// ── D · degenerate rule paths must never become catch-alls ─────────────────

describe('D: rule path validation', () => {
  for (const bad of ['', ' ', '$', '$.', '$..', '..', '   $   ', '.', '$.*', '$..*']) {
    it(`rejects ${JSON.stringify(bad)} as a rule path`, () => {
      expect(isValidRulePath(bad), `${JSON.stringify(bad)} was accepted`).toBe(false);
    });
  }

  for (const good of ['$.traceId', '$..traceId', '$.items[*].id', '$.a.b.c', '$.data[0].meta.requestId']) {
    it(`accepts ${JSON.stringify(good)}`, () => {
      expect(isValidRulePath(good)).toBe(true);
      expect(compileRulePath(good)).toBeInstanceOf(RegExp);
    });
  }

  it('a degenerate path can never silence a whole document', () => {
    for (const bad of [' ', '$', '$..', '.']) {
      const d = computeDiff('{"total":100}', '{"total":999}', { rules: rule(bad) });
      expect(d.hasDifferences, `path ${JSON.stringify(bad)} silenced the diff`).toBe(true);
    }
  });

  it('parseRulesFile drops rules with invalid paths', () => {
    const file = JSON.stringify({
      version: 1,
      endpoint: 'x',
      rules: [
        { path: ' ', type: 'uuid', source: 'manual', createdAt: 1 },
        { path: '$.realField', type: 'uuid', source: 'manual', createdAt: 2 },
      ],
    });
    const res = parseRulesFile(file);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.file.rules).toHaveLength(1);
      expect(res.file.rules[0].path).toBe('$.realField');
    }
  });

  it('addRule refuses to persist an invalid path', () => {
    localStorage.clear();
    const bad = addRule('api.example.com/v1/x', { path: '$', type: 'uuid', source: 'manual', createdAt: 1 });
    expect(bad.ok).toBe(false);
    expect(loadRules('api.example.com/v1/x')).toHaveLength(0);
  });

  it('descendant matching is linear — no catastrophic backtracking', () => {
    const longPath = '$.' + Array.from({ length: 25 }, (_, i) => `seg${i}`).join('.') + '.zzz';
    const r: NoiseRule = { path: '$..deep..nested..id', type: 'uuid', source: 'manual', createdAt: 1 };
    const matcher = compileRulePath(r.path);
    expect(matcher).toBeInstanceOf(RegExp);
    const t0 = Date.now();
    matcher!.test(longPath.slice(1));
    expect(Date.now() - t0).toBeLessThan(250);
  });
});
