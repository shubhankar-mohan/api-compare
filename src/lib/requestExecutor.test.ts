import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeComparison } from './requestExecutor';
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
});
