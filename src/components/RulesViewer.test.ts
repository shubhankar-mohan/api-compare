import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from './RulesViewer';

describe('formatRelativeTime', () => {
  const NOW = 1_776_530_000_000; // arbitrary fixed reference point

  it('shows seconds for very recent', () => {
    expect(formatRelativeTime(NOW - 5_000, NOW)).toBe('5s ago');
  });

  it('shows minutes for sub-hour', () => {
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('5m ago');
  });

  it('shows hours for sub-day', () => {
    expect(formatRelativeTime(NOW - 3 * 60 * 60_000, NOW)).toBe('3h ago');
  });

  it('shows days for sub-month', () => {
    expect(formatRelativeTime(NOW - 5 * 24 * 60 * 60_000, NOW)).toBe('5d ago');
  });

  it('shows months for sub-year', () => {
    expect(formatRelativeTime(NOW - 60 * 24 * 60 * 60_000, NOW)).toBe('2mo ago');
  });

  it('shows years for older', () => {
    expect(formatRelativeTime(NOW - 2 * 365 * 24 * 60 * 60_000, NOW)).toBe('2y ago');
  });

  it('clamps to 0s for future timestamps', () => {
    expect(formatRelativeTime(NOW + 5000, NOW)).toBe('0s ago');
  });
});
