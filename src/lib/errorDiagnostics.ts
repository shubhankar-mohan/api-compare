/**
 * Best-effort classifier for request failures.
 *
 * A browser `fetch` only ever tells JavaScript "Failed to fetch" with no
 * machine-readable cause, so for direct requests we infer the reason by running
 * follow-up probes and inspecting page/URL state.
 *
 * Requests sent through the local proxy are a different story: the proxy is a
 * Node process, so it sees the real error (DNS, TLS, connection refused) and
 * reports it. When `viaProxy` is set we trust that instead of guessing — one of
 * the quieter benefits of routing through it.
 */

export type ErrorKind =
  | 'cors'
  | 'mixed-content'
  | 'offline'
  | 'unreachable'
  | 'bad-url'
  | 'timeout'
  | 'proxy-unreachable'
  | 'unknown';

export interface ErrorDiagnosis {
  kind: ErrorKind;
  details: {
    url: string;
    method: string;
    targetOrigin: string | null;
    pageOrigin: string;
    isMixedContent: boolean;
    isOnline: boolean;
    reachable: boolean | null;
    sentHeaders: string[];
    likelyUnallowedHeaders: string[];
    rawError: string;
    /** True when this attempt went through the local proxy. */
    viaProxy: boolean;
    /**
     * Whether a local proxy is listening. Null when not checked. Lets the UI
     * offer "switch it on" rather than "go install something".
     */
    proxyRunning: boolean | null;
    /** Header names the browser refused to send. */
    strippedHeaders: string[];
    /** Subset of the above that carried credentials (Cookie). */
    strippedAuthHeaders: string[];
  };
}

export interface DiagnosisContext {
  viaProxy?: boolean;
  /** Error kind reported by the proxy itself (dns / tls / refused / timeout). */
  proxyErrorKind?: string;
  strippedHeaders?: string[];
  strippedAuthHeaders?: string[];
  /**
   * Whether a local proxy is listening, if the caller already knows.
   *
   * Deliberately supplied rather than probed here: this function runs once per
   * failed request, but the answer is per-comparison, and an extra fetch on
   * every failure path costs latency the user feels before seeing any error.
   * `executeComparison` checks once and fills this in.
   */
  proxyRunning?: boolean | null;
}

// Header names reliably covered by typical default CORS configs. Anything
// outside this set is a candidate for "the server didn't whitelist this, which
// is why the preflight failed".
const COMMONLY_ALLOWED_HEADERS = new Set([
  'accept',
  'accept-language',
  'authorization',
  'cache-control',
  'content-language',
  'content-length',
  'content-type',
  'origin',
  'x-api-key',
  'x-csrf-token',
  'x-requested-with',
]);

function pageOrigin(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  return window.location.origin;
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

/**
 * Probe whether the server is reachable at all. `no-cors` bypasses the SOP for
 * the *request* (the response is opaque, but the network layer still runs), so
 * a resolved promise means the host answered something and the original failure
 * was a CORS rejection. A rejection means DNS / TCP / TLS trouble.
 */
async function probeReachable(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return true;
  } catch {
    return false;
  }
}

function suspectUnallowedHeaders(sent: Record<string, string>): string[] {
  return Object.keys(sent)
    .map((h) => h.toLowerCase())
    .filter((h) => !COMMONLY_ALLOWED_HEADERS.has(h))
    .filter((h) => !h.startsWith('sec-'));
}

/** Map a proxy-reported cause onto our user-facing kinds. */
function kindFromProxyError(proxyErrorKind?: string): ErrorKind {
  switch (proxyErrorKind) {
    case 'timeout':
      return 'timeout';
    case 'dns':
    case 'refused':
    case 'tls':
    case 'network':
      return 'unreachable';
    case 'proxy-unreachable':
      return 'proxy-unreachable';
    case 'bad-request':
      return 'bad-url';
    default:
      return 'unknown';
  }
}

export async function diagnoseFetchError(
  url: string,
  method: string,
  sentHeaders: Record<string, string>,
  rawError: Error,
  context: DiagnosisContext = {}
): Promise<ErrorDiagnosis> {
  const origin = pageOrigin();
  const parsed = parseUrl(url);
  const rawMessage = rawError.message || String(rawError);

  const baseDetails = {
    url,
    method,
    targetOrigin: parsed ? parsed.origin : null,
    pageOrigin: origin,
    sentHeaders: Object.keys(sentHeaders),
    likelyUnallowedHeaders: suspectUnallowedHeaders(sentHeaders),
    rawError: rawMessage,
    viaProxy: context.viaProxy === true,
    proxyRunning: context.proxyRunning ?? null,
    strippedHeaders: context.strippedHeaders ?? [],
    strippedAuthHeaders: context.strippedAuthHeaders ?? [],
    isMixedContent: false,
    isOnline: isOnline(),
    reachable: null as boolean | null,
  };

  // Proxied request: the proxy already told us the real cause.
  if (context.viaProxy) {
    return {
      kind: kindFromProxyError(context.proxyErrorKind),
      details: { ...baseDetails, proxyRunning: context.proxyErrorKind !== 'proxy-unreachable' },
    };
  }

  if (!parsed) {
    return { kind: 'bad-url', details: { ...baseDetails, targetOrigin: null } };
  }

  const isMixedContent = origin.startsWith('https://') && parsed.protocol === 'http:';

  if (isMixedContent) {
    return { kind: 'mixed-content', details: { ...baseDetails, isMixedContent: true } };
  }

  if (!isOnline()) {
    return { kind: 'offline', details: { ...baseDetails, isOnline: false } };
  }

  const lowered = rawMessage.toLowerCase();
  if (lowered.includes('abort') || lowered.includes('timeout') || lowered.includes('timed out')) {
    return { kind: 'timeout', details: baseDetails };
  }

  // Last lever: a no-cors probe separates "blocked" from "not there".
  const reachable = await probeReachable(url);

  return {
    kind: reachable ? 'cors' : 'unreachable',
    details: { ...baseDetails, reachable },
  };
}
