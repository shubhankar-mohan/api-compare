import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadProxyConfig,
  saveProxyConfig,
  checkProxyHealth,
  proxyFetch,
  DEFAULT_PROXY_URL,
} from './proxyClient';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const jsonResponse = (status: number, payload: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: () => Promise.resolve(payload),
});

describe('proxyClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
  });

  describe('config persistence', () => {
    it('defaults to disabled on the standard loopback port', () => {
      expect(loadProxyConfig()).toEqual({ enabled: false, url: DEFAULT_PROXY_URL });
    });

    it('round-trips through localStorage', () => {
      saveProxyConfig({ enabled: true, url: 'http://127.0.0.1:9999' });
      expect(loadProxyConfig()).toEqual({ enabled: true, url: 'http://127.0.0.1:9999' });
    });

    it('adds a missing scheme and drops a trailing slash', () => {
      saveProxyConfig({ enabled: true, url: '127.0.0.1:8787/' });
      expect(loadProxyConfig().url).toBe('http://127.0.0.1:8787');
    });

    it('falls back to defaults on corrupted storage', () => {
      localStorage.setItem('diffchecker:proxy', 'not json');
      expect(loadProxyConfig()).toEqual({ enabled: false, url: DEFAULT_PROXY_URL });
    });

    it('never reports enabled for a truthy-but-wrong stored value', () => {
      localStorage.setItem('diffchecker:proxy', JSON.stringify({ enabled: 'yes' }));
      expect(loadProxyConfig().enabled).toBe(false);
    });
  });

  describe('checkProxyHealth', () => {
    it('reports ok when the proxy answers', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { ok: true, version: '1.0.0' }));
      const health = await checkProxyHealth('http://127.0.0.1:8787');
      expect(health.ok).toBe(true);
      expect(health.version).toBe('1.0.0');
      expect(mockFetch.mock.calls[0][0]).toBe('http://127.0.0.1:8787/health');
    });

    it('distinguishes a refused origin from a missing proxy', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(403, { ok: false }));
      const health = await checkProxyHealth();
      expect(health.ok).toBe(false);
      expect(health.originRejected).toBe(true);
      expect(health.error).toMatch(/--allow-origin/);
    });

    it('reports not-ok when nothing is listening', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
      const health = await checkProxyHealth();
      expect(health.ok).toBe(false);
      expect(health.originRejected).toBeUndefined();
    });
  });

  describe('proxyFetch', () => {
    it('posts the request envelope to /proxy', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(200, { ok: true, status: 200, statusText: 'OK', headers: {}, body: '{}' })
      );

      const result = await proxyFetch('http://127.0.0.1:8787', {
        url: 'https://api.example.com/v1/me',
        method: 'POST',
        headers: { Cookie: 'session=abc', 'content-type': 'application/json' },
        body: '{"a":1}',
      });

      expect(result.ok).toBe(true);
      const [calledUrl, init] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe('http://127.0.0.1:8787/proxy');
      expect(init.method).toBe('POST');

      const envelope = JSON.parse(init.body);
      expect(envelope.url).toBe('https://api.example.com/v1/me');
      // The proxy is not a browser, so forbidden headers survive the trip.
      expect(envelope.headers.Cookie).toBe('session=abc');
      expect(envelope.body).toBe('{"a":1}');
    });

    it('surfaces a stopped proxy as proxy-unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
      const result = await proxyFetch('http://127.0.0.1:8787', {
        url: 'https://api.example.com/x',
        method: 'GET',
        headers: {},
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('proxy-unreachable');
        expect(result.error.message).toMatch(/still running/i);
      }
    });

    it('passes through an upstream failure reported by the proxy', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse(502, { ok: false, error: { kind: 'dns', message: 'ENOTFOUND' } })
      );
      const result = await proxyFetch('http://127.0.0.1:8787', {
        url: 'https://nope.invalid/x',
        method: 'GET',
        headers: {},
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe('dns');
    });
  });
});
