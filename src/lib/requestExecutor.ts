import { ParsedCurl } from './curlParser';
import { diagnoseFetchError, ErrorDiagnosis } from './errorDiagnostics';
import { proxyFetch, checkProxyHealth, type ProxyConfig } from './proxyClient';

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  size: number;
  success: boolean;
  error?: string;
  diagnosis?: ErrorDiagnosis;
  url: string;
  responseTime?: number; // milliseconds
  /** True when the request was forwarded by the local proxy. */
  viaProxy?: boolean;
}

export interface ExecuteOptions {
  /** When enabled, requests are forwarded by the user's local proxy. */
  proxy?: ProxyConfig;
  /** Abort the request after this long. */
  timeoutMs?: number;
  /**
   * Send the browser's own cookies for the target origin. Only meaningful for
   * direct requests; the server must also send
   * `Access-Control-Allow-Credentials: true` for the response to be readable.
   */
  includeCredentials?: boolean;
  /**
   * Header names to leave off this attempt. Powers "retry without these
   * headers" when a custom header is what tripped the CORS preflight.
   */
  dropHeaders?: string[];
}

const DEFAULT_TIMEOUT_MS = 30_000;

// Standard HTTP status text mapping for consistent display
const HTTP_STATUS_TEXT: Record<number, string> = {
  100: 'Continue',
  101: 'Switching Protocols',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

function getStatusText(status: number, responseStatusText: string): string {
  if (responseStatusText && responseStatusText.trim()) {
    return responseStatusText;
  }
  return HTTP_STATUS_TEXT[status] || 'Unknown';
}

// Headers the browser refuses to let `fetch` set. Browser-copied cURL commands
// are full of these, and leaving them in guarantees a preflight failure since
// the server's Access-Control-Allow-Headers list will not name them all.
//
// Note that dropping them is not free: `cookie` in particular is parsed out of
// `-b/--cookie` by the cURL parser and then discarded here, which silently
// turns an authenticated request into an anonymous one. `stripReport` exists so
// the UI can say so rather than leaving the user to wonder why they got a 401.
const STRIP_HEADER_NAMES = new Set([
  'accept-charset',
  'accept-encoding',
  'access-control-request-headers',
  'access-control-request-method',
  'connection',
  'content-length',
  'cookie',
  'cookie2',
  'date',
  'dnt',
  'expect',
  'feature-policy',
  'host',
  'keep-alive',
  'origin',
  'priority',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'user-agent',
  'via',
]);

/** Header names that usually carry authentication and hurt most when dropped. */
const AUTH_BEARING_HEADERS = new Set(['cookie', 'cookie2']);

export function sanitizeHeadersForFetch(headers: Record<string, string>): Record<string, string> {
  return stripHeadersForFetch(headers).headers;
}

export interface StripReport {
  headers: Record<string, string>;
  /** Names removed because the browser forbids setting them. */
  stripped: string[];
  /** Subset of `stripped` that carried credentials. */
  strippedAuth: string[];
}

export function stripHeadersForFetch(
  headers: Record<string, string>,
  dropHeaders: string[] = []
): StripReport {
  const out: Record<string, string> = {};
  const stripped: string[] = [];
  const strippedAuth: string[] = [];
  const explicitDrop = new Set(dropHeaders.map((h) => h.toLowerCase()));

  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    const forbidden =
      STRIP_HEADER_NAMES.has(lower) || lower.startsWith('sec-') || lower.startsWith('proxy-');

    if (forbidden) {
      stripped.push(lower);
      if (AUTH_BEARING_HEADERS.has(lower)) strippedAuth.push(lower);
      continue;
    }
    if (explicitDrop.has(lower)) continue;

    out[key] = value;
  }
  return { headers: out, stripped, strippedAuth };
}

/** Header names to leave off, honouring the caller's explicit drop list. */
function applyDropList(
  headers: Record<string, string>,
  dropHeaders: string[] = []
): Record<string, string> {
  if (dropHeaders.length === 0) return headers;
  const drop = new Set(dropHeaders.map((h) => h.toLowerCase()));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (drop.has(key.toLowerCase())) continue;
    out[key] = value;
  }
  return out;
}

function failure(url: string, error: string, diagnosis?: ErrorDiagnosis): ApiResponse {
  return {
    status: 0,
    statusText: 'Error',
    headers: {},
    body: '',
    size: 0,
    success: false,
    error,
    diagnosis,
    url,
  };
}

/**
 * Send the request through the user's local proxy.
 *
 * Headers are forwarded verbatim — the proxy is a Node process, so the ones
 * the browser forbids (Cookie, Origin, User-Agent) go out as written.
 */
async function executeViaProxy(
  url: string,
  parsed: ParsedCurl,
  proxy: ProxyConfig,
  options: ExecuteOptions
): Promise<ApiResponse> {
  const startTime = performance.now();
  const headers = applyDropList(parsed.headers, options.dropHeaders);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const result = await proxyFetch(
    proxy.url,
    {
      url,
      method: parsed.method,
      headers,
      body: parsed.body && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(parsed.method)
        ? parsed.body
        : undefined,
    },
    AbortSignal.timeout(timeoutMs)
  );

  if (!result.ok) {
    const diagnosis = await diagnoseFetchError(url, parsed.method, headers, new Error(result.error.message), {
      viaProxy: true,
      proxyErrorKind: result.error.kind,
    });
    return failure(url, result.error.message, diagnosis);
  }

  return {
    status: result.status,
    statusText: getStatusText(result.status, result.statusText),
    headers: result.headers,
    body: result.body,
    size: new Blob([result.body]).size,
    success: true,
    url,
    responseTime: result.responseTime ?? Math.round(performance.now() - startTime),
    viaProxy: true,
  };
}

async function executeDirect(
  url: string,
  parsed: ParsedCurl,
  options: ExecuteOptions
): Promise<ApiResponse> {
  const startTime = performance.now();
  const report = stripHeadersForFetch(parsed.headers, options.dropHeaders);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const fetchOptions: RequestInit = {
      method: parsed.method,
      headers: report.headers,
      mode: 'cors',
      credentials: options.includeCredentials ? 'include' : 'same-origin',
      // Without this a hung server spins the UI forever; the `timeout`
      // diagnosis was previously unreachable because nothing ever aborted.
      signal: AbortSignal.timeout(timeoutMs),
    };

    if (parsed.body && ['POST', 'PUT', 'PATCH'].includes(parsed.method)) {
      fetchOptions.body = parsed.body;
    }

    const response = await fetch(url, fetchOptions);
    const responseTime = Math.round(performance.now() - startTime);

    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    const bodyText = await response.text();

    return {
      status: response.status,
      statusText: getStatusText(response.status, response.statusText),
      headers: headersObj,
      body: bodyText,
      size: new Blob([bodyText]).size,
      success: true,
      url,
      responseTime,
    };
  } catch (error) {
    const err = error instanceof Error ? error : new Error('Unknown error occurred');
    const diagnosis = await diagnoseFetchError(url, parsed.method, report.headers, err, {
      strippedHeaders: report.stripped,
      strippedAuthHeaders: report.strippedAuth,
    });

    return failure(url, errorMessageForKind(diagnosis), diagnosis);
  }
}

async function executeRequest(
  url: string,
  parsed: ParsedCurl,
  options: ExecuteOptions
): Promise<ApiResponse> {
  if (options.proxy?.enabled) {
    return executeViaProxy(url, parsed, options.proxy, options);
  }
  return executeDirect(url, parsed, options);
}

function errorMessageForKind(d: ErrorDiagnosis): string {
  switch (d.kind) {
    case 'cors':
      return 'Blocked by browser CORS. The server is reachable but your origin / headers are not on its allow-list.';
    case 'mixed-content':
      return 'Blocked by browser (mixed content): this page is HTTPS but the target URL is HTTP.';
    case 'offline':
      return "You're offline. Reconnect and retry.";
    case 'unreachable':
      return 'Server not reachable (DNS, TLS, or network error).';
    case 'bad-url':
      return 'Invalid URL.';
    case 'timeout':
      return 'Request timed out.';
    default:
      return d.details.rawError || 'Failed to fetch.';
  }
}

export interface ComparisonResult {
  original: ApiResponse;
  localhost: ApiResponse;
}

export async function executeComparison(
  parsed: ParsedCurl,
  parsed2: ParsedCurl,
  options: ExecuteOptions = {}
): Promise<ComparisonResult> {
  // `executeRequest` resolves with a failure-shaped ApiResponse rather than
  // rejecting, but allSettled keeps one side's unexpected throw from taking
  // the other side's result down with it.
  const [originalResult, localhostResult] = await Promise.allSettled([
    executeRequest(parsed.url, parsed, options),
    executeRequest(parsed2.url, parsed2, options),
  ]);

  const unwrap = (result: PromiseSettledResult<ApiResponse>, url: string): ApiResponse =>
    result.status === 'fulfilled'
      ? result.value
      : failure(url, result.reason?.message || 'Request failed');

  const original = unwrap(originalResult, parsed.url);
  const localhost = unwrap(localhostResult, parsed2.url);

  // If anything failed while sending directly, find out once whether a proxy is
  // already running, so the error UI can offer "use it" rather than "install
  // it". Checked here rather than per-request: it's the same answer for both
  // sides, and probing twice would double the delay before the error appears.
  const anyDirectFailure =
    !options.proxy?.enabled && (!original.success || !localhost.success);

  if (anyDirectFailure) {
    const proxyRunning = await detectRunningProxy(options.proxy?.url);
    for (const response of [original, localhost]) {
      if (response.diagnosis) response.diagnosis.details.proxyRunning = proxyRunning;
    }
  }

  return { original, localhost };
}

/**
 * Is a local proxy already listening? Lets the error UI offer "turn it on"
 * instead of "install this" when the user has one running from earlier.
 */
export async function detectRunningProxy(url?: string): Promise<boolean> {
  const health = await checkProxyHealth(url);
  return health.ok;
}
