/**
 * Tier-2 regressions: the YAML normalization regression, numeric precision
 * loss, and the three inverted threshold cliffs.
 */
import { describe, it, expect } from 'vitest';
import { computeDiff, formatJson, precisionWarnings, detectNumericPrecisionLoss } from './diffAlgorithm';
import { computeEnhancedDiff } from './enhancedDiffAlgorithm';

const Y = { config: { formatType: 'yaml' as const } };

// ── F · YAML must not be lossier than plain text ──────────────────────────

describe('F: YAML mode never reports different documents as identical', () => {
  const cases: [string, string, string][] = [
    ['quoted "yes" vs bare yes (string vs bool)', 'feature:\n  enabled: "yes"', 'feature:\n  enabled: yes'],
    ['quoted "3" vs int 3', 'spec:\n  replicas: "3"', 'spec:\n  replicas: 3'],
    ['empty string vs null', 'env:\n  value: ""', 'env:\n  value:'],
    ['valid vs invalid yaml (missing space)', 'ports:\n  - containerPort: 8080', 'ports:\n  - containerPort:8080'],
    ['image tag nginx:1.25 vs nginx: 1.25', 'spec:\n  image: nginx:1.25', 'spec:\n  image: nginx: 1.25'],
    ['cron quoted vs bare', 'spec:\n  schedule: "*/5 * * * *"', 'spec:\n  schedule: */5 * * * *'],
    ['time value 09:00 vs 09: 00', 'window:\n  open: 09:00-17:00', 'window:\n  open: 09: 00-17: 00'],
  ];

  for (const [name, a, b] of cases) {
    it(name, () => {
      expect(computeDiff(a, b, Y).hasDifferences, `YAML mode hid: ${name}`).toBe(true);
      // and it must never be worse than the plain-text path
      expect(computeDiff(a, b).hasDifferences).toBe(true);
    });
  }

  it('still avoids cascading on a real YAML edit', () => {
    const left = ['server:', '  hostname: nginx', '  port: 8080', '  tls: true'].join('\n');
    const right = ['server:', '  port: 8080', '  tls: true'].join('\n');
    const d = computeDiff(left, right, Y);
    expect(d.removals).toBe(1);
    expect(d.additions).toBe(0);
  });

  it('honours an explicit normalizeIndentation: false in YAML mode', () => {
    const a = 'root:\n  a: 1';
    const b = 'root:\n    a: 1';
    const strict = computeDiff(a, b, { config: { formatType: 'yaml', normalizeIndentation: false } });
    expect(strict.hasDifferences, 'indentation is structure in YAML').toBe(true);
  });
});

// ── G · numeric precision loss must be surfaced ───────────────────────────

describe('G: precision loss is reported rather than silently swallowed', () => {
  it('warns when an integer exceeds double precision', () => {
    const d = computeDiff('{"event_id":1234567890123456789}', '{"event_id":1234567890123456790}');
    expect(d.warnings?.length, 'no warning for a lost-precision integer').toBeGreaterThan(0);
    expect(d.warnings!.join(' ')).toMatch(/precision/i);
  });

  it('warns even when the two sides then compare equal', () => {
    const d = computeDiff('{"id":9007199254740993}', '{"id":9007199254740992}');
    expect(d.warnings?.length).toBeGreaterThan(0);
  });

  it('warns on overflow to Infinity', () => {
    const d = computeDiff('{"limit":1e400}', '{"limit":2e400}');
    expect(d.warnings?.length).toBeGreaterThan(0);
  });

  it('does not warn for ordinary numbers', () => {
    const d = computeDiff('{"a":1,"b":-1.5,"c":1e21,"total":100}', '{"a":1,"b":-1.5,"c":1e21,"total":101}');
    expect(d.warnings ?? []).toHaveLength(0);
  });

  it('names the offending field so the user can find it', () => {
    const d = computeDiff('{"order":{"snowflakeId":1234567890123456789}}', '{"order":{"snowflakeId":1}}');
    expect(d.warnings!.join(' ')).toContain('1234567890123456789');
  });
});

// ── C · threshold cliffs must not invert ──────────────────────────────────

describe('C: crossing a size guard degrades gracefully, and says so', () => {
  const insertOne = (n: number) => {
    const lines = Array.from({ length: n }, (_, i) => `INFO batch=${i} ok`);
    const mid = Math.floor(n / 2);
    return {
      left: lines.join('\n'),
      right: [...lines.slice(0, mid), 'INFO batch=NEW ok', ...lines.slice(mid)].join('\n'),
    };
  };

  for (const n of [1499, 1500, 1501, 3000]) {
    it(`text: one insertion into ${n} lines stays one insertion`, () => {
      const { left, right } = insertOne(n);
      const d = computeDiff(left, right);
      expect(d.additions, `cascade at n=${n}`).toBe(1);
      expect(d.removals).toBe(0);
      expect(d.degraded ?? false).toBe(false);
    });
  }

  it('text: beyond the cap it degrades but flags it', () => {
    const { left, right } = insertOne(20000);
    const d = computeDiff(left, right);
    expect(d.degraded, 'silently degraded with no signal').toBe(true);
  });

  const prepend = (n: number) => ({
    left: JSON.stringify({ ids: Array.from({ length: n }, (_, i) => i) }),
    right: JSON.stringify({ ids: [-1, ...Array.from({ length: n }, (_, i) => i)] }),
  });

  for (const n of [1199, 1200, 1201, 2500]) {
    it(`array: prepending to ${n} elements costs one element`, () => {
      const { left, right } = prepend(n);
      const d = computeDiff(left, right);
      expect(d.additions, `array cliff at n=${n}`).toBe(1);
      expect(d.removals).toBe(0);
    });
  }

  it('inline segment computation stays fast just under its cap', () => {
    const mk = (v: string) => {
      const o: Record<string, string> = {};
      for (let i = 0; i < 2900; i++) o[`field_${i}`] = `value-${i}-${v}-${'x'.repeat(60)}`;
      return JSON.stringify(o);
    };
    const t0 = Date.now();
    computeDiff(mk('a'), mk('b'));
    const ms = Date.now() - t0;
    console.log(`[perf inline just-under-cap] ${ms}ms`);
    expect(ms, 'quadratic segment assembly').toBeLessThan(4000);
  }, 120000);
});

// ── G (cont.) · detection must run on the RAW body, not the formatted one ──

describe('G: precision detection runs before any JSON round-trip', () => {
  const RAW_LEFT = '{"event":{"snowflakeId":1234567890123456789}}';
  const RAW_RIGHT = '{"event":{"snowflakeId":1234567890123456790}}';

  it('detection survives a JSON round-trip (the rounded literal is also unrepresentable)', () => {
    expect(detectNumericPrecisionLoss(RAW_LEFT)).toHaveLength(1);
    // The rounded value cannot be represented exactly either, so this still
    // trips — useful defence in depth, but not something to rely on: scan the
    // raw body, which is what the server actually sent.
    expect(detectNumericPrecisionLoss(formatJson(RAW_LEFT))).toHaveLength(1);
  });

  it('warnings are produced from the raw pair the way the UI does it', () => {
    const warnings = precisionWarnings(RAW_LEFT, RAW_RIGHT);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.join(' ')).toContain('1234567890123456789');
  });

  it('the two bodies format identically — the silent wrong answer — but still warn', () => {
    const lf = formatJson(RAW_LEFT);
    const rf = formatJson(RAW_RIGHT);
    expect(lf, 'distinct ids collapsed to the same text').toBe(rf);

    const formatted = computeDiff(lf, rf);
    expect(formatted.hasDifferences).toBe(false);
    expect(formatted.warnings?.length, 'no warning on the silent-equal path').toBeGreaterThan(0);
  });

  it('computeEnhancedDiff keeps the warning through its identical-text early exit', () => {
    const lf = formatJson(RAW_LEFT);
    const e = computeEnhancedDiff(lf, lf, { advancedMode: true });
    expect(e.hasDifferences).toBe(false);
    expect(e.warnings?.length, 'early exit dropped the warning').toBeGreaterThan(0);
  });
});
