import { ParsedCurl } from './curlParser';

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  size: number;
  success: boolean;
  error?: string;
  url: string;
  responseTime?: number; // milliseconds
}

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
  // Use response statusText if available, otherwise fall back to our mapping
  if (responseStatusText && responseStatusText.trim()) {
    return responseStatusText;
  }
  return HTTP_STATUS_TEXT[status] || 'Unknown';
}

// Headers that browsers refuse to set via fetch() (or that aren't part of API contracts).
// Browser-copied curls include lots of these — keeping them causes CORS preflight failures
// because the server's Access-Control-Allow-Headers list rarely includes them all.
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

export function sanitizeHeadersForFetch(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (STRIP_HEADER_NAMES.has(lower)) continue;
    if (lower.startsWith('sec-')) continue;
    if (lower.startsWith('proxy-')) continue;
    out[key] = value;
  }
  return out;
}

async function executeRequest(url: string, parsed: ParsedCurl): Promise<ApiResponse> {
  const startTime = performance.now();
  try {
    const fetchOptions: RequestInit = {
      method: parsed.method,
      headers: sanitizeHeadersForFetch(parsed.headers),
      mode: 'cors',
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    const isHttpsPage =
      typeof window !== 'undefined' &&
      typeof window.location !== 'undefined' &&
      window.location.protocol === 'https:';

    // When the app is served over HTTPS, browsers often block HTTP localhost calls as "Mixed Content".
    const enhancedError =
      isHttpsPage && url.startsWith('http://')
        ? 'Blocked by browser (mixed content): this page is HTTPS but your localhost URL is HTTP. Use https://localhost (recommended) or run this app locally over http://.'
        : errorMessage === 'Failed to fetch'
          ? 'Failed to fetch (CORS, mixed content, or server not reachable).'
          : errorMessage;

    return {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: '',
      size: 0,
      success: false,
      error: enhancedError,
      url,
    };
  }
}

export interface ComparisonResult {
  original: ApiResponse;
  localhost: ApiResponse;
}

export async function executeComparison(
  parsed: ParsedCurl,
  parsed2: ParsedCurl
): Promise<ComparisonResult> {
  const [originalResult, localhostResult] = await Promise.allSettled([
    executeRequest(parsed.url, parsed),
    executeRequest(parsed2.url, parsed2),
  ]);
  const original: ApiResponse = originalResult.status === 'fulfilled'
    ? originalResult.value
    : {
        status: 0,
        statusText: 'Failed',
        headers: {},
        body: '',
        size: 0,
        success: false,
        error: originalResult.reason?.message || 'Request failed',
        url: parsed.url,
      };

  const localhost: ApiResponse = localhostResult.status === 'fulfilled'
    ? localhostResult.value
    : {
        status: 0,
        statusText: 'Failed',
        headers: {},
        body: '',
        size: 0,
        success: false,
        error: localhostResult.reason?.message || 'Request failed',
        url: parsed2.url,
      };

  return { original, localhost };
}
