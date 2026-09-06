#!/usr/bin/env node
/**
 * DiffChecker local proxy.
 *
 * Why this exists
 * ---------------
 * A browser will not let a web page read a cross-origin response unless the
 * target server opts in with `Access-Control-Allow-Origin`. Production APIs
 * will never allow-list a diffing tool, and you usually cannot change their
 * config. That leaves three options: disable CORS browser-wide with an
 * extension (broad, risky), paste responses by hand, or make the request from
 * something that is not a browser.
 *
 * This is the third option. It runs on your machine, forwards one request, and
 * returns the response with CORS headers the browser will accept. Your data
 * path is:
 *
 *     browser  ->  127.0.0.1 (this process)  ->  the API
 *
 * Nothing is sent to any third party. There is no telemetry and nothing is
 * written to disk. Stop the process and the capability is gone.
 *
 * It also restores what browser `fetch` cannot do: forbidden request headers
 * such as Cookie, Origin and User-Agent are stripped by the browser but can be
 * set from here, so session-authenticated cURL commands work again.
 *
 * Usage
 * -----
 *   npx @shubhankar-mohan/diffchecker-proxy
 *   npx @shubhankar-mohan/diffchecker-proxy --port 9000
 *   npx @shubhankar-mohan/diffchecker-proxy --allow-origin https://my-internal-tool.corp
 *   npx @shubhankar-mohan/diffchecker-proxy --allow-origin '*'        # any page may use it
 *
 * Requires Node 18+ (for global fetch).
 */

import http from 'node:http';
import dns from 'node:dns';
import { parseArgs } from 'node:util';

// Node 18 leaves autoSelectFamily off, so undici resolves "localhost" to ::1
// and never falls back to 127.0.0.1. Dev servers bound to IPv4 (Flask, Rails,
// http.server --bind 127.0.0.1) were then reported as "connection refused"
// while curl reached them fine — and "prod vs localhost" is the primary use
// case for this proxy. Preferring IPv4 makes the hostname behave as expected.
dns.setDefaultResultOrder('ipv4first');

const VERSION = '1.0.0';
const DEFAULT_PORT = 8787;

// Origins allowed to use this proxy. A localhost relay that answers every
// origin is an open relay for any tab you have open, so nothing is allowed by
// default except loopback origins (where the app runs during development).
// A hosted copy of the app must be named explicitly with --allow-origin.
// This list used to pre-authorise https://diffchecker.dev, a domain this
// project does not own — any script on that site could have driven the relay.
const DEFAULT_ALLOWED_ORIGINS = [];

const LOOPBACK_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

// Hop-by-hop and browser-managed headers that must not be forwarded verbatim.
const SKIP_REQUEST_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const ALLOWED_METHODS = new Set([
  'GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS',
]);

const MAX_BODY_BYTES = 25 * 1024 * 1024; // 25 MB request body cap
// Upstream responses are read with a byte budget rather than `.text()`: a
// 200 MB body used to be buffered whole and left the process at over 1 GB.
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

function parseCliArgs() {
  try {
    const { values } = parseArgs({
      options: {
        port: { type: 'string', short: 'p' },
        'allow-origin': { type: 'string', multiple: true },
        timeout: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
    return values;
  } catch (err) {
    console.error(`diffchecker-proxy: ${err.message}`);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
diffchecker-proxy ${VERSION}

  Forwards one API request from your machine so the browser can read the
  response. Nothing leaves your machine except the request you asked for.

Options
  -p, --port <n>            Port to listen on (default ${DEFAULT_PORT})
      --allow-origin <o>    Allow a hosted copy of the app, e.g.
                            --allow-origin https://diff.example.com
                            (repeatable, or '*' to allow any page)
      --timeout <ms>        Upstream request timeout (default ${DEFAULT_TIMEOUT_MS})
  -h, --help                Show this message
  -v, --version             Print version

Security
  Binds to 127.0.0.1 only, so nothing on your network can reach it.
  Only pages served from localhost, plus any --allow-origin you pass, may
  use it. Upstream responses over ${MAX_RESPONSE_BYTES / (1024 * 1024)} MB and request bodies over
  ${MAX_BODY_BYTES / (1024 * 1024)} MB are refused. Stop the process to revoke access.
`);
}

function originAllowed(origin, extraOrigins) {
  if (!origin) return false;
  if (extraOrigins.includes('*')) return true;
  if (LOOPBACK_ORIGIN_RE.test(origin)) return true;
  return DEFAULT_ALLOWED_ORIGINS.includes(origin) || extraOrigins.includes(origin);
}

function setCorsHeaders(res, origin, allowed) {
  if (!allowed) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-diffchecker-proxy');
  res.setHeader('Access-Control-Max-Age', '600');
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Stop reading but keep the socket open so the caller can answer
        // 413; destroying it first left the client with an empty reply that
        // looked like "proxy not running".
        req.pause();
        const err = new Error(`Request body exceeds ${MAX_BODY_BYTES / (1024 * 1024)} MB limit`);
        err.kind = 'too-large';
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Classify an upstream failure into something the UI can act on. */
function describeUpstreamError(err) {
  const cause = err?.cause ?? err;
  const code = cause?.code ?? '';
  const message = cause?.message ?? err?.message ?? String(err);

  if (err?.kind === 'too-large') {
    return { kind: 'too-large', message: err.message };
  }
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return { kind: 'timeout', message: 'The API did not respond in time.' };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return { kind: 'dns', message: `DNS could not resolve the hostname. (${code})` };
  }
  if (code === 'ECONNREFUSED') {
    return { kind: 'refused', message: 'Connection refused — nothing is listening there.' };
  }
  if (code === 'CERT_HAS_EXPIRED' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    return { kind: 'tls', message: `TLS certificate rejected. (${code})` };
  }
  return { kind: 'network', message };
}

/** Read a response body up to `max` bytes; throws a 'too-large' error past it. */
async function readCapped(response, max) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      const err = new Error(`Upstream response exceeds ${max / (1024 * 1024)} MB; compare a smaller payload.`);
      err.kind = 'too-large';
      throw err;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function handleProxy(req, res, origin, timeoutMs) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (err) {
    if (err?.kind === 'too-large') {
      sendJson(res, 413, { ok: false, error: { kind: 'too-large', message: err.message } });
      req.destroy();
      return;
    }
    sendJson(res, 400, { ok: false, error: { kind: 'bad-request', message: err.message } });
    return;
  }

  // Every field is validated before use. Previously `headers: null` reached
  // Object.entries() and `method: 42` reached .toUpperCase(), each throwing an
  // uncaught TypeError that killed the process — one malformed request from any
  // allowed origin took the proxy down with no restart.
  const { url, method = 'GET', headers = {}, body } = payload ?? {};

  const bad = (message) =>
    sendJson(res, 400, { ok: false, error: { kind: 'bad-request', message } });

  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    bad('An absolute http(s) `url` is required.');
    return;
  }
  if (typeof method !== 'string' || !ALLOWED_METHODS.has(method.toUpperCase())) {
    bad('Unsupported method. Use one of: ' + [...ALLOWED_METHODS].join(', ') + '.');
    return;
  }
  if (headers === null || typeof headers !== 'object' || Array.isArray(headers)) {
    bad('`headers` must be an object.');
    return;
  }
  if (body !== undefined && body !== null && typeof body !== 'string') {
    bad('`body` must be a string when present.');
    return;
  }

  const upperMethod = method.toUpperCase();

  const forwarded = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value !== 'string') continue;
    if (SKIP_REQUEST_HEADERS.has(name.toLowerCase())) continue;
    forwarded[name] = value;
  }

  const started = Date.now();
  try {
    const upstream = await fetch(url, {
      method: upperMethod,
      headers: forwarded,
      body: ['GET', 'HEAD'].includes(upperMethod) ? undefined : body,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await readCapped(upstream, MAX_RESPONSE_BYTES);
    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    console.log(`  ${upperMethod} ${url} -> ${upstream.status} (${Date.now() - started}ms)`);

    sendJson(res, 200, {
      ok: true,
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
      body: text,
      finalUrl: upstream.url,
      responseTime: Date.now() - started,
    });
  } catch (err) {
    const described = describeUpstreamError(err);
    console.log(`  ${upperMethod} ${url} -> ${described.kind}: ${described.message}`);
    sendJson(res, 502, { ok: false, error: described });
  }
}

function main() {
  const args = parseCliArgs();

  if (args.help) return printHelp();
  if (args.version) return console.log(VERSION);

  const port = Number(args.port ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`diffchecker-proxy: invalid port "${args.port}"`);
    process.exit(1);
  }

  const timeoutMs = Number(args.timeout ?? DEFAULT_TIMEOUT_MS);
  const extraOrigins = args['allow-origin'] ?? [];

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin ?? '';
    const allowed = originAllowed(origin, extraOrigins);
    setCorsHeaders(res, origin, allowed);

    if (req.method === 'OPTIONS') {
      res.writeHead(allowed ? 204 : 403);
      res.end();
      return;
    }

    const path = (req.url ?? '/').split('?')[0];

    // Read-only and reveals nothing but the version: answer it for a browser
    // tab or curl (no Origin) so "is it running?" has a plain answer.
    if (req.method === 'GET' && (path === '/health' || path === '/')) {
      sendJson(res, 200, { ok: true, name: 'diffchecker-proxy', version: VERSION });
      return;
    }

    if (!allowed) {
      sendJson(res, 403, {
        ok: false,
        error: {
          kind: 'origin-not-allowed',
          message: `Origin "${origin || '(none)'}" may not use this proxy. Restart with --allow-origin ${origin || '<origin>'}`,
        },
      });
      return;
    }

    if (req.method === 'POST' && path === '/proxy') {
      await handleProxy(req, res, origin, timeoutMs);
      return;
    }

    sendJson(res, 404, { ok: false, error: { kind: 'not-found', message: `No route for ${req.method} ${path}` } });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\ndiffchecker-proxy: port ${port} is already in use.\n` +
          `Either another copy is already running (that is fine — use it), or\n` +
          `pick a different port:  npx @shubhankar-mohan/diffchecker-proxy --port ${port + 1}\n`
      );
      process.exit(1);
    }
    console.error(`diffchecker-proxy: ${err.message}`);
    process.exit(1);
  });

  // 127.0.0.1 rather than 0.0.0.0: nothing else on the network can reach this.
  server.listen(port, '127.0.0.1', () => {
    console.log(`
  diffchecker-proxy ${VERSION}

  Listening on   http://127.0.0.1:${port}
  Allowed origins: any localhost port${extraOrigins.length ? ', plus ' + extraOrigins.join(', ') : ''}

  Paste that address into DiffChecker's proxy setting, then run your comparison.
  Requests are forwarded from this machine. Nothing is stored or sent anywhere else.

  Press Ctrl+C to stop.
`);
  });

  const shutdown = () => {
    console.log('\n  Stopped. The proxy is no longer reachable.\n');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
