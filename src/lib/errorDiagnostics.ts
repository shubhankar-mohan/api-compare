/**
 * Best-effort classifier for fetch() failures. fetch() only tells JS "Failed to fetch"
 * with no machine-readable cause, so we infer by running follow-up probes and inspecting
 * page/URL state. The output drives the user-facing error UX.
 */

export type ErrorKind =
  | 'cors'
  | 'mixed-content'
  | 'offline'
  | 'unreachable'
  | 'bad-url'
  | 'timeout'
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
  };
}

// Header names that are reliably part of the default CORS allow-list across typical
// server configs. Anything outside this set is a candidate for "your server didn't
// whitelist this and that's why the preflight failed."
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
 * Probe whether the server is reachable at all. `no-cors` mode bypasses the SOP
 * for the *request* (we can't read the response, but the network layer still runs),
 * so a resolved promise means the server answered something. A rejected promise
 * means DNS / TCP / TLS / cert error — the host isn't reachable.
 */
async function probeReachable(url: string, timeoutMs = 5000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
      cache: 'no-store',
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function suspectUnallowedHeaders(sent: Record<string, string>): string[] {
  return Object.keys(sent)
    .map((h) => h.toLowerCase())
    .filter((h) => !COMMONLY_ALLOWED_HEADERS.has(h))
    .filter((h) => !h.startsWith('sec-'));
}

export async function diagnoseFetchError(
  url: string,
  method: string,
  sentHeaders: Record<string, string>,
  rawError: Error,
): Promise<ErrorDiagnosis> {
  const origin = pageOrigin();
  const parsed = parseUrl(url);
  const targetOrigin = parsed ? parsed.origin : null;
  const sentHeaderNames = Object.keys(sentHeaders);
  const likelyUnallowedHeaders = suspectUnallowedHeaders(sentHeaders);
  const rawMessage = rawError.message || String(rawError);

  const baseDetails = {
    url,
    method,
    targetOrigin,
    pageOrigin: origin,
    sentHeaders: sentHeaderNames,
    likelyUnallowedHeaders,
    rawError: rawMessage,
  };

  if (!parsed) {
    return {
      kind: 'bad-url',
      details: {
        ...baseDetails,
        targetOrigin: null,
        isMixedContent: false,
        isOnline: isOnline(),
        reachable: null,
      },
    };
  }

  const isHttpsPage = origin.startsWith('https://');
  const isHttpTarget = parsed.protocol === 'http:';
  const isMixedContent = isHttpsPage && isHttpTarget;

  if (isMixedContent) {
    return {
      kind: 'mixed-content',
      details: {
        ...baseDetails,
        isMixedContent: true,
        isOnline: isOnline(),
        reachable: null,
      },
    };
  }

  if (!isOnline()) {
    return {
      kind: 'offline',
      details: {
        ...baseDetails,
        isMixedContent: false,
        isOnline: false,
        reachable: null,
      },
    };
  }

  if (rawMessage.toLowerCase().includes('abort') || rawMessage.toLowerCase().includes('timeout')) {
    return {
      kind: 'timeout',
      details: {
        ...baseDetails,
        isMixedContent: false,
        isOnline: true,
        reachable: null,
      },
    };
  }

  // Last lever: a no-cors probe. If the host answers, the original failure was
  // a CORS rejection. If the probe also fails, the host is unreachable.
  const reachable = await probeReachable(url);

  return {
    kind: reachable ? 'cors' : 'unreachable',
    details: {
      ...baseDetails,
      isMixedContent: false,
      isOnline: true,
      reachable,
    },
  };
}
