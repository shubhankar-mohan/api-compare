import { ParsedCurl, replaceUrlDomain } from './curlParser';

export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  size: number;
  success: boolean;
  error?: string;
  url: string;
}

async function executeRequest(url: string, parsed: ParsedCurl): Promise<ApiResponse> {
  try {
    const fetchOptions: RequestInit = {
      method: parsed.method,
      headers: parsed.headers,
      mode: 'cors',
    };

    if (parsed.body && ['POST', 'PUT', 'PATCH'].includes(parsed.method)) {
      fetchOptions.body = parsed.body;
    }

    const response = await fetch(url, fetchOptions);
    
    const headersObj: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headersObj[key] = value;
    });

    const bodyText = await response.text();

    return {
      status: response.status,
      statusText: response.statusText,
      headers: headersObj,
      body: bodyText,
      size: new Blob([bodyText]).size,
      success: true,
      url,
    };
  } catch (error) {
    return {
      status: 0,
      statusText: 'Error',
      headers: {},
      body: '',
      size: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
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
  localhostUrl: string
): Promise<ComparisonResult> {
  const localUrl = replaceUrlDomain(parsed.url, localhostUrl);

  const [originalResult, localhostResult] = await Promise.allSettled([
    executeRequest(parsed.url, parsed),
    executeRequest(localUrl, parsed),
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
        url: localUrl,
      };

  return { original, localhost };
}
