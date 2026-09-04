import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeComparison, sanitizeHeadersForFetch } from './requestExecutor';
import { ParsedCurl } from './curlParser';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('requestExecutor', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  const makeParsed = (url: string, overrides?: Partial<ParsedCurl>): ParsedCurl => ({
    url,
    method: 'GET',
    headers: {},
    body: null,
    originalDomain: '',
    ...overrides,
  });

  describe('executeComparison', () => {
    it('returns both responses on success', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: () => Promise.resolve('{"ok":true}'),
      });

      const result = await executeComparison(
        makeParsed('https://api.example.com/data'),
        makeParsed('http://localhost:8080/data')
      );

      expect(result.original.status).toBe(200);
      expect(result.original.body).toBe('{"ok":true}');
      expect(result.original.success).toBe(true);
      expect(result.localhost.status).toBe(200);
      expect(result.localhost.success).toBe(true);
    });

    it('handles 400 response without crashing', async () => {
      mockFetch.mockResolvedValue({
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers(),
        text: () => Promise.resolve('{"error":"invalid request"}'),
      });

      const result = await executeComparison(
        makeParsed('https://api.example.com/data'),
        makeParsed('http://localhost:8080/data')
      );

      expect(result.original.status).toBe(400);
      expect(result.original.success).toBe(true); // fetch succeeded, server returned 400
      expect(result.original.body).toBe('{"error":"invalid request"}');
    });

    it('handles network failure gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      const result = await executeComparison(
        makeParsed('https://api.example.com/data'),
        makeParsed('http://localhost:8080/data')
      );

      expect(result.original.success).toBe(false);
      expect(result.original.error).toBeTruthy();
      expect(result.localhost.success).toBe(false);
    });

    it('handles one success and one failure', async () => {
      mockFetch
        .mockResolvedValueOnce({
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          text: () => Promise.resolve('{"ok":true}'),
        })
        .mockRejectedValueOnce(new Error('Connection refused'));

      const result = await executeComparison(
        makeParsed('https://api.example.com/data'),
        makeParsed('http://localhost:8080/data')
      );

      expect(result.original.success).toBe(true);
      expect(result.localhost.success).toBe(false);
    });

    it('sends POST body correctly', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: () => Promise.resolve('ok'),
      });

      await executeComparison(
        makeParsed('https://api.example.com/data', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"test":true}',
        }),
        makeParsed('http://localhost:8080/data', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"test":true}',
        })
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const firstCall = mockFetch.mock.calls[0];
      expect(firstCall[1].method).toBe('POST');
      expect(firstCall[1].body).toBe('{"test":true}');
    });

    it('strips browser-only headers before fetch (CORS preflight fix)', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: () => Promise.resolve('ok'),
      });

      await executeComparison(
        makeParsed('https://api.example.com/data', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'origin': 'https://other.example.com',
            'referer': 'https://other.example.com/',
            'priority': 'u=1, i',
            'sec-ch-ua': '"Chromium";v="146"',
            'sec-fetch-mode': 'cors',
            'user-agent': 'Mozilla/5.0',
            'authorization': 'Bearer abc',
          },
          body: '{"test":true}',
        }),
        makeParsed('http://localhost:8080/data', { method: 'POST' })
      );

      const sentHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      // Kept
      expect(sentHeaders['accept']).toBe('application/json');
      expect(sentHeaders['content-type']).toBe('application/json');
      expect(sentHeaders['authorization']).toBe('Bearer abc');
      // Stripped
      expect(sentHeaders['origin']).toBeUndefined();
      expect(sentHeaders['referer']).toBeUndefined();
      expect(sentHeaders['priority']).toBeUndefined();
      expect(sentHeaders['sec-ch-ua']).toBeUndefined();
      expect(sentHeaders['sec-fetch-mode']).toBeUndefined();
      expect(sentHeaders['user-agent']).toBeUndefined();
    });

    it('includes responseTime in results', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: () => Promise.resolve('ok'),
      });

      const result = await executeComparison(
        makeParsed('https://api.example.com/data'),
        makeParsed('http://localhost:8080/data')
      );

      expect(result.original.responseTime).toBeDefined();
      expect(typeof result.original.responseTime).toBe('number');
    });
  });

  describe('proxy routing', () => {
    const proxy = { enabled: true, url: 'http://127.0.0.1:8787' };

    const proxyOk = (body: string) => ({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          body,
          responseTime: 12,
        }),
    });

    it('sends the request to the proxy instead of the target', async () => {
      mockFetch.mockResolvedValue(proxyOk('{"ok":true}'));

      const result = await executeComparison(
        makeParsed('https://api.production.example.com/orders'),
        makeParsed('http://localhost:8080/orders'),
        { proxy }
      );

      expect(mockFetch.mock.calls[0][0]).toBe('http://127.0.0.1:8787/proxy');
      expect(result.original.success).toBe(true);
      expect(result.original.viaProxy).toBe(true);
      expect(result.original.body).toBe('{"ok":true}');
    });

    it('forwards Cookie through the proxy instead of dropping it', async () => {
      mockFetch.mockResolvedValue(proxyOk('{}'));

      await executeComparison(
        makeParsed('https://api.production.example.com/me', {
          headers: { Cookie: 'session=abc123', accept: 'application/json' },
        }),
        makeParsed('http://localhost:8080/me'),
        { proxy }
      );

      const envelope = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(envelope.headers.Cookie).toBe('session=abc123');
      expect(envelope.url).toBe('https://api.production.example.com/me');
    });

    it('reports a stopped proxy as proxy-unreachable rather than a CORS problem', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      const result = await executeComparison(
        makeParsed('https://api.production.example.com/x'),
        makeParsed('http://localhost:8080/x'),
        { proxy }
      );

      expect(result.original.success).toBe(false);
      expect(result.original.diagnosis?.kind).toBe('proxy-unreachable');
    });

    it('maps an upstream DNS failure reported by the proxy to unreachable', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        json: () =>
          Promise.resolve({ ok: false, error: { kind: 'dns', message: 'ENOTFOUND api.bad' } }),
      });

      const result = await executeComparison(
        makeParsed('https://api.bad/x'),
        makeParsed('http://localhost:8080/x'),
        { proxy }
      );

      expect(result.original.diagnosis?.kind).toBe('unreachable');
      expect(result.original.diagnosis?.details.viaProxy).toBe(true);
      // The proxy sees the real OS error; the browser only ever says "Failed to fetch".
      expect(result.original.error).toContain('ENOTFOUND');
    });
  });

  describe('direct request diagnostics', () => {
    it('records that Cookie was stripped so the UI can explain the 401', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      const result = await executeComparison(
        makeParsed('https://api.example.com/me', { headers: { Cookie: 'session=abc' } }),
        makeParsed('http://localhost:8080/me')
      );

      expect(result.original.diagnosis?.details.strippedHeaders).toContain('cookie');
      expect(result.original.diagnosis?.details.strippedAuthHeaders).toContain('cookie');
    });

    it('honours an explicit header drop list for retry-without-headers', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: () => Promise.resolve('ok'),
      });

      await executeComparison(
        makeParsed('https://api.example.com/data', {
          headers: { accept: 'application/json', 'x-trace-id': 'abc', 'x-tenant': 't1' },
        }),
        makeParsed('http://localhost:8080/data'),
        { dropHeaders: ['x-trace-id', 'x-tenant'] }
      );

      const sentHeaders = mockFetch.mock.calls[0][1].headers as Record<string, string>;
      expect(sentHeaders['accept']).toBe('application/json');
      expect(sentHeaders['x-trace-id']).toBeUndefined();
      expect(sentHeaders['x-tenant']).toBeUndefined();
    });

    it('aborts rather than hanging forever', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: () => Promise.resolve('ok'),
      });

      await executeComparison(
        makeParsed('https://api.example.com/data'),
        makeParsed('http://localhost:8080/data')
      );

      // Previously no signal was attached at all, which made the `timeout`
      // diagnosis unreachable and let a hung server spin the UI indefinitely.
      expect(mockFetch.mock.calls[0][1].signal).toBeDefined();
    });
  });
});
