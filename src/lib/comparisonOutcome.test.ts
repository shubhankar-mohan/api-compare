import { describe, it, expect } from 'vitest';
import { comparisonOutcome } from './comparisonOutcome';
import type { ApiResponse } from './requestExecutor';

const ok = (body: string, status = 200): ApiResponse => ({
  status, statusText: 'OK', headers: {}, body, size: body.length, success: true, url: 'https://a',
});
const failed = (error: string): ApiResponse => ({
  status: 0, statusText: '', headers: {}, body: '', size: 0, success: false, error, url: 'https://a',
});

describe('comparisonOutcome', () => {
  it('reports a failed side instead of claiming a verdict', () => {
    const o = comparisonOutcome({ original: ok('{}'), localhost: failed('ECONNREFUSED') });
    expect(o.variant).toBe('destructive');
    expect(o.title).toMatch(/request failed/i);
    expect(o.description).toMatch(/localhost/i);
  });

  it('reports both sides failing without saying the responses are identical', () => {
    const o = comparisonOutcome({ original: failed('x'), localhost: failed('y') });
    expect(o.variant).toBe('destructive');
    expect(o.description).not.toMatch(/identical/i);
  });

  it('does not judge the bodies itself: the diff on screen owns the verdict', () => {
    // Key order differs, so a text comparison would say "differences found"
    // while the tree diff (and the summary badge) says none.
    const o = comparisonOutcome({ original: ok('{"a":1,"b":2}'), localhost: ok('{"b":2,"a":1}') });
    expect(o.variant).toBeUndefined();
    expect(o.description).not.toMatch(/differences found|identical/i);
  });

  it('does not double the full stop when the error already ends with one', () => {
    const o = comparisonOutcome({ original: ok('{}'), localhost: failed('Server not reachable (DNS, TLS, or network error).') });
    expect(o.description).not.toContain('..');
  });

  it('mentions a status mismatch, which needs no diff to know', () => {
    const o = comparisonOutcome({ original: ok('{}', 200), localhost: ok('{}', 500) });
    expect(o.description).toMatch(/200.*500|status/i);
  });
});
