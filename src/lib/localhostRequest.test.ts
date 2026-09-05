import { describe, it, expect } from 'vitest';
import { toLocalhostRequest } from './localhostRequest';
import { parseCurl } from './curlParser';

describe('toLocalhostRequest', () => {
  it('keeps a body containing an apostrophe intact', () => {
    const parsed = parseCurl(`curl 'https://api.example.com/v1/users' -H 'Content-Type: application/json' -d '{"name":"O'"'"'Brien","x":1}'`);
    const local = toLocalhostRequest(parsed, 'http://localhost:3000');
    expect(local.url).toBe('http://localhost:3000/v1/users');
    expect(local.body).toBe(parsed.body);
    expect(local.body).toContain("O'Brien");
  });

  it('carries method, headers and query string over', () => {
    const parsed = parseCurl(`curl -X PUT 'https://api.example.com/v1/items/9?expand=all' -H "X-Msg: it's fine" -H 'Authorization: Bearer t'`);
    const local = toLocalhostRequest(parsed, 'http://localhost:8080/');
    expect(local.method).toBe('PUT');
    expect(local.url).toBe('http://localhost:8080/v1/items/9?expand=all');
    expect(local.headers['X-Msg']).toBe("it's fine");
    expect(local.headers['Authorization']).toBe('Bearer t');
  });

  it('does not mutate the production request', () => {
    const parsed = parseCurl(`curl 'https://api.example.com/v1/users'`);
    const before = JSON.stringify(parsed);
    toLocalhostRequest(parsed, 'http://localhost:3000');
    expect(JSON.stringify(parsed)).toBe(before);
  });

  it('throws on an unusable production URL', () => {
    const parsed = parseCurl(`curl 'not a url'`);
    expect(() => toLocalhostRequest(parsed, 'http://localhost:3000')).toThrow();
  });
});
