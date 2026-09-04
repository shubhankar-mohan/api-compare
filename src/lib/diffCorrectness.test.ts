/**
 * Correctness invariants for the diff engine.
 *
 * These are oracle tests: rather than asserting a specific rendering, they
 * assert properties that must hold for ANY correct diff. They exist because
 * the previous suite (250 passing tests) could not distinguish a correct diff
 * from one that silently dropped lines or reported changed values as identical.
 *
 * Three invariants:
 *
 *   I1 FIDELITY   — each pane, read back on its own, reconstructs its input.
 *                   Catches dropped lines, duplicated lines, orphaned lines
 *                   emitted outside the document structure.
 *   I2 SOUNDNESS  — semantically different inputs report hasDifferences.
 *                   Catches false negatives (the dangerous direction: the user
 *                   ships the bug the tool was supposed to catch).
 *   I3 PRECISION  — semantically identical inputs report no differences.
 *                   Catches false positives from key order / formatting.
 *
 * Plus a perf guard in the 200-1500 line band, which is where real API
 * responses live and where the old suite had no coverage at all.
 */
import { describe, it, expect } from 'vitest';
import { computeDiff } from './diffAlgorithm';
import type { DiffResult, DiffLine } from './diffAlgorithm';

const NOISE_MARKER_RE = /\s*\/\*\s*NOISE:[a-z0-9-]+:(?:auto|rule)\s*\*\//g;
const LEGACY_MARKER_RE = /\s*\/\*\s*(?:TIMESTAMP|ID)\s*\*\//g;

/** Reconstruct one pane's text, dropping alignment padding and inline markers. */
function paneText(lines: DiffLine[]): string {
  return lines
    .filter((l) => l && l.type !== 'empty')
    .map((l) => (l.content ?? '').replace(NOISE_MARKER_RE, '').replace(LEGACY_MARKER_RE, ''))
    .join('\n');
}

/** I1: the pane must parse back to exactly the value it was given. */
function expectPaneReconstructs(lines: DiffLine[], original: string, side: string) {
  const text = paneText(lines);
  let reparsed: unknown;
  try {
    reparsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      `[I1 FIDELITY] ${side} pane is not valid JSON — lines were dropped or emitted out of structure.\n` +
        `Parse error: ${(err as Error).message}\n--- pane ---\n${text}\n--- expected ---\n${JSON.stringify(JSON.parse(original), null, 2)}`
    );
  }
  expect(reparsed, `[I1 FIDELITY] ${side} pane did not reconstruct its input`).toEqual(
    JSON.parse(original)
  );
}

function bothPanesReconstruct(left: string, right: string, opts?: Parameters<typeof computeDiff>[2]) {
  const d = computeDiff(left, right, opts);
  expectPaneReconstructs(d.left, left, 'LEFT');
  expectPaneReconstructs(d.right, right, 'RIGHT');
  return d;
}

/** Panes must be index-aligned and equal length. */
function expectAligned(d: DiffResult) {
  expect(d.left.length, '[ALIGN] pane lengths differ').toBe(d.right.length);
  for (let i = 0; i < d.left.length; i++) {
    expect(d.left[i], `[ALIGN] hole in left pane at ${i}`).toBeTruthy();
    expect(d.right[i], `[ALIGN] hole in right pane at ${i}`).toBeTruthy();
  }
}

// ───────────────────────────────────────────────────────────────────────────
// I1 — FIDELITY
// ───────────────────────────────────────────────────────────────────────────

describe('I1 fidelity: each pane reconstructs its own input', () => {
  const cases: [string, unknown, unknown][] = [
    ['array element prepended', { items: [{ sku: 'B', qty: 2 }, { sku: 'C', qty: 3 }] }, { items: [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }, { sku: 'C', qty: 3 }] }],
    ['array element appended', { items: [{ sku: 'B', qty: 2 }] }, { items: [{ sku: 'B', qty: 2 }, { sku: 'D', qty: 4 }] }],
    ['array element removed', { items: [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }, { sku: 'C', qty: 3 }] }, { items: [{ sku: 'A', qty: 1 }, { sku: 'C', qty: 3 }] }],
    ['array element inserted in middle', { items: [1, 2, 5] }, { items: [1, 2, 3, 4, 5] }],
    ['nested object added', { a: 1, z: 26 }, { a: 1, meta: { region: 'us', shard: 4 }, z: 26 }],
    ['nested object removed', { a: 1, meta: { region: 'us' }, z: 26 }, { a: 1, z: 26 }],
    ['key appended at end of object', { a: 1, b: 2 }, { a: 1, b: 2, c: 3 }],
    ['key removed from end of object', { a: 1, b: 2, c: 3 }, { a: 1, b: 2 }],
    ['key renamed', { a: 1, b: 2, c: 3 }, { a: 1, bb: 2, c: 3 }],
    ['scalar changed', { a: 1, b: 2 }, { a: 1, b: 99 }],
    ['type changed', { a: 1 }, { a: 'one' }],
    ['null vs value', { a: null }, { a: 5 }],
    ['empty object vs populated', {}, { a: 1 }],
    ['empty array vs populated', { xs: [] }, { xs: [1, 2] }],
    ['deeply nested change', { l1: { l2: { l3: { l4: { v: 1 } } } } }, { l1: { l2: { l3: { l4: { v: 2 } } } } }],
    ['array of objects reordered', { xs: [{ id: 1, v: 'a' }, { id: 2, v: 'b' }] }, { xs: [{ id: 2, v: 'b' }, { id: 1, v: 'a' }] }],
    ['unicode and escapes', { s: 'a"b\\c\nd\tè😀' }, { s: 'a"b\\c\nd\tè😀!' }],
    ['numbers of many shapes', { a: 0, b: -1.5, c: 1e21, d: 1e-7 }, { a: 0, b: -1.5, c: 1e21, d: 2e-7 }],
    ['top-level array', [1, 2, 3], [1, 2, 3, 4]],
    ['top-level scalar', 42, 43],
    ['booleans', { ok: true }, { ok: false }],
    ['mixed array types', { xs: [1, 'two', null, { three: 3 }, [4]] }, { xs: [1, 'two', null, { three: 4 }, [4]] }],
  ];

  for (const [name, left, right] of cases) {
    it(name, () => {
      const d = bothPanesReconstruct(JSON.stringify(left), JSON.stringify(right));
      expectAligned(d);
    });
  }

  it('holds when noise rules are applied', () => {
    const left = JSON.stringify({ traceId: '550e8400-e29b-41d4-a716-446655440000', v: 1 });
    const right = JSON.stringify({ traceId: '660e8400-e29b-41d4-a716-446655440111', v: 1 });
    const rules = [{ path: '$.traceId', type: 'uuid' as const, source: 'manual' as const, createdAt: 0 }];
    bothPanesReconstruct(left, right, { rules });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// I2 — SOUNDNESS (no false negatives)
// ───────────────────────────────────────────────────────────────────────────

describe('I2 soundness: different values are never reported identical', () => {
  const mustDiffer: [string, unknown, unknown][] = [
    // Hex-shaped values under id-ish key names. These were all silently
    // suppressed by the legacy /* ID */ path.
    ['orderId hex-shaped', { orderId: 'abc123' }, { orderId: 'def456' }],
    ['accountId digits', { accountId: '0012345' }, { accountId: '0099999' }],
    ['validationCode hex', { validationCode: 'abcdef' }, { validationCode: 'beefed' }],
    ['userId uuid', { userId: '550e8400-e29b-41d4-a716-446655440000' }, { userId: '660e8400-e29b-41d4-a716-446655440111' }],
    ['token hex', { token: 'deadbeef' }, { token: 'cafebabe' }],
    // "provider" and "paid" contain the substring "id".
    ['provider hex', { provider: 'abcdef' }, { provider: 'fedcba' }],
    ['paidFlag hex', { paidFlag: 'abc' }, { paidFlag: 'def' }],
    ['candidate hex', { candidate: 'abcdef' }, { candidate: 'fedcba' }],
    // Timestamps. A cache/TTL bug is exactly what these would hide.
    ['updated_at differs by a year', { updated_at: '2024-01-01T00:00:00Z' }, { updated_at: '2025-01-01T00:00:00Z' }],
    ['expiryDate differs by six years', { expiryDate: '2024-01-01T00:00:00Z' }, { expiryDate: '2030-01-01T00:00:00Z' }],
    ['createdAt epoch millis', { createdAt: '1700000000000' }, { createdAt: '1800000000000' }],
    // Ordinary values.
    ['plain string', { colour: 'red' }, { colour: 'blue' }],
    ['number', { total: 100 }, { total: 101 }],
    ['boolean', { active: true }, { active: false }],
    ['null vs zero', { v: null }, { v: 0 }],
    ['missing key', { a: 1 }, { a: 1, b: 2 }],
    ['array length', { xs: [1, 2] }, { xs: [1, 2, 3] }],
    ['nested deep change', { a: { b: { c: 1 } } }, { a: { b: { c: 2 } } }],
    ['string vs number same text', { v: '1' }, { v: 1 }],
  ];

  for (const [name, left, right] of mustDiffer) {
    it(name, () => {
      const d = computeDiff(JSON.stringify(left), JSON.stringify(right));
      expect(d.hasDifferences, `[I2 SOUNDNESS] false negative: ${name}`).toBe(true);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// I3 — PRECISION (no false positives)
// ───────────────────────────────────────────────────────────────────────────

describe('I3 precision: identical values are never reported different', () => {
  const mustMatch: [string, string, string][] = [
    ['key order differs', JSON.stringify({ id: 1, name: 'a', email: 'e', role: 'r' }), JSON.stringify({ name: 'a', role: 'r', id: 1, email: 'e' })],
    ['key order differs, nested', JSON.stringify({ o: { x: 1, y: 2 } }), JSON.stringify({ o: { y: 2, x: 1 } })],
    ['whitespace/formatting differs', '{"a":1,"b":[1,2,3]}', '{\n  "a": 1,\n  "b": [\n    1,\n    2,\n    3\n  ]\n}'],
    ['numeric 1.0 vs 1', '{"a":1.0}', '{"a":1}'],
    ['numeric 1e3 vs 1000', '{"a":1e3}', '{"a":1000}'],
    ['identical documents', JSON.stringify({ a: [1, { b: 2 }] }), JSON.stringify({ a: [1, { b: 2 }] })],
  ];

  for (const [name, left, right] of mustMatch) {
    it(name, () => {
      const d = computeDiff(left, right);
      expect(d.hasDifferences, `[I3 PRECISION] false positive: ${name}`).toBe(false);
      expect(d.additions, `[I3 PRECISION] spurious additions: ${name}`).toBe(0);
      expect(d.removals, `[I3 PRECISION] spurious removals: ${name}`).toBe(0);
    });
  }

  it('a trailing comma flip does not create a phantom diff on the previous line', () => {
    const d = computeDiff(JSON.stringify({ a: 1, b: 2 }), JSON.stringify({ a: 1, b: 2, c: 3 }));
    // "b" is unchanged; only "c" is added.
    const bLeft = d.left.find((l) => (l.content || '').includes('"b"'));
    expect(bLeft?.type, '[I3] "b" marked changed purely because it gained a comma').toBe('unchanged');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Noise rules must actually suppress, not just grey out
// ───────────────────────────────────────────────────────────────────────────

describe('noise rules suppress the difference, not just its opacity', () => {
  const rule = (path: string) => [{ path, type: 'uuid' as const, source: 'manual' as const, createdAt: 0 }];

  it('a rule on a differing field clears hasDifferences', () => {
    const left = JSON.stringify({ nonce: 'zzzzzzzzzzzz', ok: true });
    const right = JSON.stringify({ nonce: 'yyyyyyyyyyyy', ok: true });
    expect(computeDiff(left, right).hasDifferences).toBe(true);
    const suppressed = computeDiff(left, right, { rules: rule('$.nonce') });
    expect(suppressed.hasDifferences, 'rule did not suppress the diff').toBe(false);
    expect(suppressed.additions).toBe(0);
    expect(suppressed.removals).toBe(0);
  });

  it('a rule does not suppress unrelated fields', () => {
    const left = JSON.stringify({ nonce: 'aaa', real: 1 });
    const right = JSON.stringify({ nonce: 'bbb', real: 2 });
    const d = computeDiff(left, right, { rules: rule('$.nonce') });
    expect(d.hasDifferences, 'rule over-suppressed a real change').toBe(true);
  });

  it('wildcard descendant rules work', () => {
    const left = JSON.stringify({ data: { inner: { traceId: 'aaa' } }, v: 1 });
    const right = JSON.stringify({ data: { inner: { traceId: 'bbb' } }, v: 1 });
    expect(computeDiff(left, right, { rules: rule('$..traceId') }).hasDifferences).toBe(false);
  });

  it('array wildcard rules work', () => {
    const left = JSON.stringify({ items: [{ id: 'a1', n: 1 }, { id: 'a2', n: 2 }] });
    const right = JSON.stringify({ items: [{ id: 'b1', n: 1 }, { id: 'b2', n: 2 }] });
    expect(computeDiff(left, right, { rules: rule('$.items[*].id') }).hasDifferences).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Text (non-JSON) path
// ───────────────────────────────────────────────────────────────────────────

describe('text diff: a single insertion is a single insertion at every size', () => {
  const insertOne = (n: number) => {
    const base = Array.from({ length: n }, (_, i) => `line ${i}`);
    const withIns = [...base.slice(0, 2), 'INSERTED', ...base.slice(2)];
    return { left: base.join('\n'), right: withIns.join('\n') };
  };

  // The old <10-line shortcut bypassed LCS, so small inputs behaved worse
  // than large ones. Sizes chosen to straddle that boundary.
  for (const n of [3, 5, 8, 9, 10, 12, 40]) {
    it(`${n}-line text, one line inserted`, () => {
      const { left, right } = insertOne(n);
      const d = computeDiff(left, right);
      expect(d.additions, `[TEXT] cascade at n=${n}: expected 1 addition`).toBe(1);
      expect(d.removals, `[TEXT] cascade at n=${n}: expected 0 removals`).toBe(0);
    });
  }

  it('panes reconstruct their text inputs', () => {
    const { left, right } = insertOne(6);
    const d = computeDiff(left, right);
    expect(paneText(d.left)).toBe(left);
    expect(paneText(d.right)).toBe(right);
  });

  it('a single deletion is a single deletion', () => {
    const base = Array.from({ length: 6 }, (_, i) => `line ${i}`);
    const removed = base.filter((_, i) => i !== 2);
    const d = computeDiff(base.join('\n'), removed.join('\n'));
    expect(d.removals).toBe(1);
    expect(d.additions).toBe(0);
  });

  it('identical text has no differences', () => {
    const t = 'alpha\nbravo\ncharlie';
    const d = computeDiff(t, t);
    expect(d.hasDifferences).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// YAML / config path
// ───────────────────────────────────────────────────────────────────────────

describe('yaml/config: a missing field does not cascade', () => {
  const yamlCfg = { config: { formatType: 'yaml' as const, normalizeIndentation: true } };

  it('one removed key marks exactly one line removed', () => {
    const left = ['server:', '  hostname: nginx', '  port: 8080', '  tls: true', '  workers: 4'].join('\n');
    const right = ['server:', '  port: 8080', '  tls: true', '  workers: 4'].join('\n');
    const d = computeDiff(left, right, yamlCfg);
    expect(d.removals, 'missing field cascaded to following lines').toBe(1);
    expect(d.additions).toBe(0);
  });

  it('one added key marks exactly one line added', () => {
    const left = ['a: 1', 'b: 2', 'c: 3'].join('\n');
    const right = ['a: 1', 'b: 2', 'bb: 22', 'c: 3'].join('\n');
    const d = computeDiff(left, right, yamlCfg);
    expect(d.additions).toBe(1);
    expect(d.removals).toBe(0);
  });

  it('panes reconstruct their inputs', () => {
    const left = ['a: 1', 'b: 2', 'c: 3'].join('\n');
    const right = ['a: 1', 'bb: 22', 'c: 3', 'd: 4'].join('\n');
    const d = computeDiff(left, right, yamlCfg);
    expect(paneText(d.left)).toBe(left);
    expect(paneText(d.right)).toBe(right);
  });

  it('lines at different nesting depths are not matched to each other', () => {
    // 6-space and 8-space indents used to normalize to the same value.
    const left = ['root:', '  a:', '    deep:', '      id: 5'].join('\n');
    const right = ['root:', '  a:', '    deep:', '      nested:', '        id: 5'].join('\n');
    const d = computeDiff(left, right, yamlCfg);
    expect(paneText(d.left)).toBe(left);
    expect(paneText(d.right)).toBe(right);
    expect(d.hasDifferences).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Performance in the 200-1500 line band
// ───────────────────────────────────────────────────────────────────────────

describe('performance: the 200-1500 line band, dissimilar content', () => {
  /** Worst case for a similarity scan: no line resembles any other line. */
  const dissimilar = (n: number) => {
    const l: Record<string, string> = {};
    const r: Record<string, string> = {};
    for (let i = 0; i < n; i++) {
      l[`aaaaa${i}`] = 'a'.repeat(45) + i;
      r[`zzzzz${i}`] = 'z'.repeat(45) + i;
    }
    return { left: JSON.stringify(l), right: JSON.stringify(r) };
  };

  for (const [n, budgetMs] of [[300, 1000], [700, 1500], [1400, 2500]] as const) {
    it(`${n} dissimilar entries completes under ${budgetMs}ms`, () => {
      const { left, right } = dissimilar(n);
      const t0 = performance.now();
      computeDiff(left, right);
      const elapsed = performance.now() - t0;
      console.log(`[perf ${n} dissimilar] ${elapsed.toFixed(0)}ms`);
      expect(elapsed, `[PERF] quadratic blowup at n=${n}`).toBeLessThan(budgetMs);
    }, 120000);
  }

  it('1400 similar entries stays fast', () => {
    const l: Record<string, string> = {};
    const r: Record<string, string> = {};
    for (let i = 0; i < 1400; i++) {
      l[`k${i}`] = `value-${i}-alpha`;
      r[`k${i}`] = `value-${i}-beta`;
    }
    const t0 = performance.now();
    computeDiff(JSON.stringify(l), JSON.stringify(r));
    const elapsed = performance.now() - t0;
    console.log(`[perf 1400 similar] ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(2500);
  }, 120000);
});
