import { describe, it, expect } from 'vitest';
import { pushHistoryItem, MAX_HISTORY, type CurlHistoryItem } from './useCurlHistory';

const item = (command: string, localhostUrl = 'http://localhost:3000', ts = 1): CurlHistoryItem => ({
  id: `${ts}`,
  command,
  localhostUrl,
  timestamp: ts,
});

describe('pushHistoryItem', () => {
  it('moves a repeated comparison to the top instead of duplicating it', () => {
    const prev = [item('curl a', 'http://l', 1), item('curl b', 'http://l', 2)];
    const next = pushHistoryItem(prev, item('curl a', 'http://l', 3));
    expect(next.map((i) => i.command)).toEqual(['curl a', 'curl b']);
    expect(next[0].timestamp).toBe(3);
  });

  it('keeps at most MAX_HISTORY entries', () => {
    let list: CurlHistoryItem[] = [];
    for (let i = 0; i < MAX_HISTORY + 5; i++) list = pushHistoryItem(list, item(`curl ${i}`, 'http://l', i));
    expect(list).toHaveLength(MAX_HISTORY);
    expect(list[0].command).toBe(`curl ${MAX_HISTORY + 4}`);
  });

  it('refuses entries that would not fit in localStorage', () => {
    const huge = item(`curl x -d '${'a'.repeat(300_000)}'`);
    expect(pushHistoryItem([], huge)).toEqual([]);
  });
});
