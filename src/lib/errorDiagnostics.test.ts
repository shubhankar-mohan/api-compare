import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { diagnoseFetchError } from './errorDiagnostics';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const setOrigin = (origin: string) => {
  vi.stubGlobal('window', { location: { origin, protocol: origin.split(':')[0] + ':' } });
};

const setOnline = (online: boolean) => {
  Object.defineProperty(globalThis.navigator, 'onLine', {
    configurable: true,
    get: () => online,
  });
};

describe('diagnoseFetchError', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setOrigin('http://localhost:8081');
    setOnline(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', mockFetch);
  });

  it('classifies invalid URLs as bad-url', async () => {
    const d = await diagnoseFetchError('not a url', 'GET', {}, new Error('Failed to fetch'));
    expect(d.kind).toBe('bad-url');
    expect(d.details.targetOrigin).toBeNull();
  });

  it('classifies HTTPS-page-to-HTTP-target as mixed-content', async () => {
    setOrigin('https://app.example.com');
    const d = await diagnoseFetchError(
      'http://localhost:8080/api',
      'GET',
      {},
      new Error('Failed to fetch'),
    );
    expect(d.kind).toBe('mixed-content');
    expect(d.details.isMixedContent).toBe(true);
  });

  it('classifies offline state', async () => {
    setOnline(false);
    const d = await diagnoseFetchError(
      'https://api.example.com/x',
      'GET',
      {},
      new Error('Failed to fetch'),
    );
    expect(d.kind).toBe('offline');
    expect(d.details.isOnline).toBe(false);
  });

  it('classifies AbortError as timeout', async () => {
    const d = await diagnoseFetchError(
      'https://api.example.com/x',
      'GET',
      {},
      new Error('The operation was aborted.'),
    );
    expect(d.kind).toBe('timeout');
  });

  it('classifies as CORS when reachability probe succeeds', async () => {
    mockFetch.mockResolvedValueOnce({ status: 0, type: 'opaque' });
    const d = await diagnoseFetchError(
      'https://api.example.com/x',
      'POST',
      { 'Content-Type': 'application/json', 'X-User-Id': 'abc' },
      new Error('Failed to fetch'),
    );
    expect(d.kind).toBe('cors');
    expect(d.details.reachable).toBe(true);
    expect(d.details.likelyUnallowedHeaders).toContain('x-user-id');
    expect(d.details.likelyUnallowedHeaders).not.toContain('content-type');
  });

  it('classifies as unreachable when reachability probe fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
    const d = await diagnoseFetchError(
      'https://api.nonexistent.tld/x',
      'GET',
      {},
      new Error('Failed to fetch'),
    );
    expect(d.kind).toBe('unreachable');
    expect(d.details.reachable).toBe(false);
  });

  it('flags only non-standard headers as suspect', async () => {
    mockFetch.mockResolvedValueOnce({ status: 0, type: 'opaque' });
    const d = await diagnoseFetchError(
      'https://api.example.com/x',
      'POST',
      {
        Accept: 'application/json',
        Authorization: 'Bearer x',
        'Content-Type': 'application/json',
        'X-User-Id': 'abc',
        'Sentry-Trace': 'xyz',
        Baggage: 'a=b',
      },
      new Error('Failed to fetch'),
    );
    expect(d.details.likelyUnallowedHeaders.sort()).toEqual(
      ['baggage', 'sentry-trace', 'x-user-id'].sort(),
    );
  });
});
