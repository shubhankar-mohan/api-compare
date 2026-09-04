/**
 * Client for the DiffChecker local proxy (`npx @diffchecker/proxy`).
 *
 * A browser cannot read a cross-origin response that the target server did not
 * authorize, and production APIs will not allow-list a diffing tool. The proxy
 * runs on the user's own machine and makes the request from there, so the page
 * only ever talks to `127.0.0.1`.
 *
 * This keeps the product's privacy guarantee intact: the request goes from the
 * user's browser, to the user's machine, to the API. No third party is
 * involved, unlike a hosted CORS relay.
 *
 * Settings live in localStorage only.
 */

export const DEFAULT_PROXY_URL = 'http://127.0.0.1:8787';
export const PROXY_INSTALL_COMMAND = 'npx @diffchecker/proxy';

/**
 * Fallback that needs no npm registry at all.
 *
 * The proxy is a single zero-dependency file, so fetching and running it
 * directly is a legitimate distribution path — and it works the moment the
 * repository is public, without waiting on a package publish.
 */
export const PROXY_DIRECT_COMMAND =
  'curl -fsSL https://raw.githubusercontent.com/shubhankar-mohan/api-compare/main/proxy/diffchecker-proxy.mjs -o diffchecker-proxy.mjs && node diffchecker-proxy.mjs';

const STORAGE_KEY = 'diffchecker:proxy';
const HEALTH_TIMEOUT_MS = 2500;

export interface ProxyConfig {
  enabled: boolean;
  url: string;
}

export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  enabled: false,
  url: DEFAULT_PROXY_URL,
};

function normalizeProxyUrl(raw: string): string {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_PROXY_URL;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export function loadProxyConfig(): ProxyConfig {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_PROXY_CONFIG };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROXY_CONFIG };
    const parsed = JSON.parse(raw) as Partial<ProxyConfig>;
    return {
      enabled: parsed.enabled === true,
      url: normalizeProxyUrl(typeof parsed.url === 'string' ? parsed.url : DEFAULT_PROXY_URL),
    };
  } catch {
    return { ...DEFAULT_PROXY_CONFIG };
  }
}

export function saveProxyConfig(config: ProxyConfig): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ enabled: config.enabled, url: normalizeProxyUrl(config.url) })
    );
  } catch {
    // Private mode / storage disabled — the setting just won't persist.
  }
}

export interface ProxyHealth {
  ok: boolean;
  version?: string;
  /** Set when the proxy answered but refused this origin. */
  originRejected?: boolean;
  error?: string;
}

/**
 * Is a proxy listening and willing to serve this origin?
 *
 * Used both by the setup dialog's verify button and, opportunistically, when a
 * direct request fails — if a proxy is already running we can say "turn it on"
 * instead of "install something".
 */
export async function checkProxyHealth(
  url: string = DEFAULT_PROXY_URL,
  timeoutMs = HEALTH_TIMEOUT_MS
): Promise<ProxyHealth> {
  const base = normalizeProxyUrl(url);
  try {
    const response = await fetch(`${base}/health`, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status === 403) {
      return {
        ok: false,
        originRejected: true,
        error: `The proxy is running but will not serve ${location.origin}. Restart it with --allow-origin ${location.origin}`,
      };
    }
    if (!response.ok) {
      return { ok: false, error: `Proxy responded with ${response.status}.` };
    }

    const payload = (await response.json()) as { ok?: boolean; version?: string };
    return { ok: payload.ok === true, version: payload.version };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not reach the proxy.',
    };
  }
}

export interface ProxyRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ProxySuccess {
  ok: true;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  finalUrl?: string;
  responseTime?: number;
}

export interface ProxyFailure {
  ok: false;
  error: { kind: string; message: string };
}

export type ProxyResult = ProxySuccess | ProxyFailure;

/**
 * Forward one request through the proxy.
 *
 * Headers are passed through untouched — the proxy is not a browser, so the
 * headers `fetch` refuses to set (Cookie, Origin, User-Agent, ...) work here.
 * That is what makes session-authenticated cURL commands comparable.
 */
export async function proxyFetch(
  proxyUrl: string,
  request: ProxyRequest,
  signal?: AbortSignal
): Promise<ProxyResult> {
  const base = normalizeProxyUrl(proxyUrl);
  try {
    const response = await fetch(`${base}/proxy`, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });

    const payload = (await response.json()) as ProxyResult;
    return payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Reaching the proxy itself failed — it is probably not running.
    return {
      ok: false,
      error: {
        kind: 'proxy-unreachable',
        message: `Could not reach the local proxy at ${base}. Is it still running? ${message}`,
      },
    };
  }
}
