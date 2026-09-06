// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

const PROXY = path.resolve(__dirname, '../../proxy/diffchecker-proxy.mjs');

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

async function waitFor(url: string, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`proxy did not start: ${url}`);
}

describe('diffchecker-proxy server', () => {
  let proxy: ChildProcess;
  let proxyPort: number;
  let upstream: http.Server;
  let upstreamPort: number;

  beforeAll(async () => {
    proxyPort = await freePort();
    upstreamPort = await freePort();
    upstream = http.createServer((req, res) => {
      if (req.url === '/huge') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        const chunk = Buffer.alloc(1024 * 1024, 'x');
        let sent = 0;
        const push = () => {
          while (sent < 60) {
            sent++;
            if (!res.write(chunk)) return res.once('drain', push);
          }
          res.end();
        };
        push();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ path: req.url, method: req.method }));
    });
    await new Promise<void>((r) => upstream.listen(upstreamPort, '127.0.0.1', () => r()));
    proxy = spawn('node', [PROXY, '--port', String(proxyPort)], { stdio: 'ignore' });
    await waitFor(`http://127.0.0.1:${proxyPort}/health`);
  }, 20000);

  afterAll(async () => {
    proxy?.kill();
    await new Promise<void>((r) => upstream.close(() => r()));
  });

  const call = (body: unknown, origin?: string) =>
    fetch(`http://127.0.0.1:${proxyPort}/proxy`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
      body: JSON.stringify(body),
    });

  it('answers /health without an Origin header (a browser tab or curl)', async () => {
    const r = await fetch(`http://127.0.0.1:${proxyPort}/health`);
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
  });

  it('refuses /proxy for a foreign origin and for no origin', async () => {
    expect((await call({ url: `http://127.0.0.1:${upstreamPort}/x`, method: 'GET' }, 'https://evil.example')).status).toBe(403);
    expect((await call({ url: `http://127.0.0.1:${upstreamPort}/x`, method: 'GET' })).status).toBe(403);
  });

  it('does not allow-list any third-party site by default', async () => {
    for (const origin of ['https://diffchecker.dev', 'https://www.diffchecker.dev', 'https://diffchecker.com']) {
      expect((await call({ url: `http://127.0.0.1:${upstreamPort}/x`, method: 'GET' }, origin)).status).toBe(403);
    }
  });

  it('relays a request from a loopback origin', async () => {
    const r = await call({ url: `http://127.0.0.1:${upstreamPort}/items?a=1`, method: 'GET', headers: {} }, 'http://localhost:8080');
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(JSON.parse(j.body)).toEqual({ path: '/items?a=1', method: 'GET' });
  });

  it('caps the upstream response size instead of buffering it whole', async () => {
    const r = await call({ url: `http://127.0.0.1:${upstreamPort}/huge`, method: 'GET', headers: {} }, 'http://localhost:8080');
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(j.error.kind).toBe('too-large');
  }, 20000);
});
