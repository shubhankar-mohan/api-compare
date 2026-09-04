import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  canonicalizeEndpoint,
  loadRules,
  saveRules,
  forgetRule,
  addRule,
  exportRulesFile,
  parseRulesFile,
  storageKey,
  NoiseRule,
} from './noiseRules';

beforeEach(() => {
  // jsdom provides localStorage; clear between tests
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
  vi.restoreAllMocks();
});

describe('canonicalizeEndpoint', () => {
  it('lowercases hostname', () => {
    expect(canonicalizeEndpoint('https://API.Example.com/v1/users')).toBe('api.example.com/v1/users');
  });

  it('strips userinfo (user:pass@)', () => {
    expect(canonicalizeEndpoint('https://user:pass@example.com/v1')).toBe('example.com/v1');
  });

  it('strips trailing slash', () => {
    expect(canonicalizeEndpoint('https://example.com/v1/users/')).toBe('example.com/v1/users');
  });

  it('strips trailing slash from root', () => {
    expect(canonicalizeEndpoint('https://example.com/')).toBe('example.com');
  });

  it('collapses repeated slashes in path', () => {
    expect(canonicalizeEndpoint('https://example.com///v1//users')).toBe('example.com/v1/users');
  });

  it('preserves port', () => {
    expect(canonicalizeEndpoint('https://example.com:8080/v1')).toBe('example.com:8080/v1');
  });

  it('strips query string', () => {
    expect(canonicalizeEndpoint('https://example.com/v1?foo=1&bar=2')).toBe('example.com/v1');
  });

  it('strips fragment', () => {
    expect(canonicalizeEndpoint('https://example.com/v1#section')).toBe('example.com/v1');
  });

  it('strips both query and fragment', () => {
    expect(canonicalizeEndpoint('https://example.com/v1?foo=1#bar')).toBe('example.com/v1');
  });

  it('handles invalid URL via fallback', () => {
    // No protocol AND no host-like pattern that URL() can rescue.
    // Fallback path lowercases, strips fragment after `#`, collapses slashes.
    expect(canonicalizeEndpoint('NOT A URL !@#frag')).toBe('not a url !@');
  });

  it('handles URL with IDN (internationalized hostname)', () => {
    // Punycode form
    const result = canonicalizeEndpoint('https://xn--bcher-kva.example.com/path');
    expect(result.startsWith('xn--bcher-kva.example.com')).toBe(true);
  });

  it('handles empty path', () => {
    expect(canonicalizeEndpoint('https://example.com')).toBe('example.com');
  });

  it('caps very long URL at 256 chars', () => {
    const longPath = 'a'.repeat(500);
    const result = canonicalizeEndpoint(`https://example.com/${longPath}`);
    expect(result.length).toBeLessThanOrEqual(256);
  });

  it('handles missing protocol (bare host:port/path)', () => {
    expect(canonicalizeEndpoint('example.com/v1/users')).toBe('example.com/v1/users');
  });

  it('handles empty input', () => {
    expect(canonicalizeEndpoint('')).toBe('');
  });

  it('handles whitespace-only input', () => {
    expect(canonicalizeEndpoint('   ')).toBe('');
  });
});

describe('loadRules', () => {
  it('returns [] for missing entry', () => {
    expect(loadRules('https://example.com/v1')).toEqual([]);
  });

  it('returns [] for malformed JSON and warns', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(storageKey('example.com/v1'), '{not json');
    expect(loadRules('https://example.com/v1')).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('returns [] for entry that parses but is wrong shape', () => {
    localStorage.setItem(storageKey('example.com/v1'), '"a string, not an object"');
    expect(loadRules('https://example.com/v1')).toEqual([]);
  });

  it('returns rules from {rules: [...]} wrapped form', () => {
    const rule: NoiseRule = { path: '$.id', type: 'uuid', source: 'manual', createdAt: 1776530000 };
    localStorage.setItem(
      storageKey('example.com/v1'),
      JSON.stringify({ endpoint: 'example.com/v1', rules: [rule] })
    );
    expect(loadRules('https://example.com/v1')).toEqual([rule]);
  });

  it('returns rules from bare-array form (legacy / lenient)', () => {
    const rule: NoiseRule = { path: '$.id', type: 'uuid', source: 'manual', createdAt: 1776530000 };
    localStorage.setItem(storageKey('example.com/v1'), JSON.stringify([rule]));
    expect(loadRules('https://example.com/v1')).toEqual([rule]);
  });

  it('filters out malformed individual rules', () => {
    const good: NoiseRule = { path: '$.id', type: 'uuid', source: 'manual', createdAt: 1776530000 };
    const bad = { wrong: 'shape' };
    localStorage.setItem(
      storageKey('example.com/v1'),
      JSON.stringify({ rules: [good, bad, null, 'not an object'] })
    );
    expect(loadRules('https://example.com/v1')).toEqual([good]);
  });
});

describe('saveRules', () => {
  it('writes to localStorage and round-trips via loadRules', () => {
    const rule: NoiseRule = { path: '$.traceId', type: 'trace-id', source: 'manual', createdAt: 1776530000 };
    const result = saveRules('https://example.com/v1', [rule]);
    expect(result.ok).toBe(true);
    expect(loadRules('https://example.com/v1')).toEqual([rule]);
  });

  it('returns error on quota exceeded', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      const err = new Error('quota');
      (err as unknown as { name: string }).name = 'QuotaExceededError';
      throw err;
    });
    const rule: NoiseRule = { path: '$.id', type: 'uuid', source: 'manual', createdAt: 1 };
    const result = saveRules('https://example.com/v1', [rule]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/full|quota/i);
    setItem.mockRestore();
  });

  it('returns error on invalid endpoint', () => {
    const result = saveRules('', []);
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('saves empty rules array (clears)', () => {
    saveRules('https://example.com/v1', [{ path: '$.id', type: 'uuid', source: 'manual', createdAt: 1 }]);
    saveRules('https://example.com/v1', []);
    expect(loadRules('https://example.com/v1')).toEqual([]);
  });
});

describe('addRule and forgetRule', () => {
  it('addRule appends a new rule', () => {
    const rule: NoiseRule = { path: '$.id', type: 'uuid', source: 'manual', createdAt: 1 };
    addRule('https://example.com/v1', rule);
    expect(loadRules('https://example.com/v1')).toEqual([rule]);
  });

  it('addRule replaces existing rule with same path', () => {
    const r1: NoiseRule = { path: '$.id', type: 'uuid', source: 'auto', createdAt: 1 };
    const r2: NoiseRule = { path: '$.id', type: 'uuid', source: 'manual', createdAt: 2 };
    addRule('https://example.com/v1', r1);
    addRule('https://example.com/v1', r2);
    expect(loadRules('https://example.com/v1')).toEqual([r2]);
  });

  it('forgetRule removes by path', () => {
    const r1: NoiseRule = { path: '$.id', type: 'uuid', source: 'manual', createdAt: 1 };
    const r2: NoiseRule = { path: '$.traceId', type: 'trace-id', source: 'manual', createdAt: 2 };
    addRule('https://example.com/v1', r1);
    addRule('https://example.com/v1', r2);
    forgetRule('https://example.com/v1', '$.id');
    expect(loadRules('https://example.com/v1')).toEqual([r2]);
  });
});

describe('exportRulesFile / parseRulesFile', () => {
  it('round-trips rules via export+parse', () => {
    const rule: NoiseRule = { path: '$.id', type: 'uuid', source: 'manual', createdAt: 1776530000 };
    saveRules('https://example.com/v1', [rule]);
    const file = exportRulesFile('https://example.com/v1');
    const json = JSON.stringify(file);
    const parsed = parseRulesFile(json);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.file.rules).toEqual([rule]);
      expect(parsed.file.version).toBe(1);
    }
  });

  it('rejects malformed JSON', () => {
    const result = parseRulesFile('{not json');
    expect(result.ok).toBe(false);
  });

  it('rejects file missing version field', () => {
    const result = parseRulesFile(JSON.stringify({ rules: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/version/i);
  });

  it('rejects unknown version (newer file)', () => {
    const result = parseRulesFile(JSON.stringify({ version: 2, rules: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/newer/i);
  });

  it('rejects file missing rules array', () => {
    const result = parseRulesFile(JSON.stringify({ version: 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/rules/i);
  });

  it('accepts file with empty rules array', () => {
    const result = parseRulesFile(JSON.stringify({ version: 1, rules: [] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file.rules).toEqual([]);
  });

  it('drops malformed individual rules but accepts the rest', () => {
    const good: NoiseRule = { path: '$.id', type: 'uuid', source: 'manual', createdAt: 1 };
    const result = parseRulesFile(
      JSON.stringify({ version: 1, rules: [good, { bad: true }, null] })
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file.rules).toEqual([good]);
  });
});

describe('storageKey', () => {
  it('builds the canonical key', () => {
    expect(storageKey('example.com/v1')).toBe('diffchecker:rules:example.com/v1');
  });
});
