export interface ParsedCurl {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  originalDomain: string;
}

export function parseCurl(curlCommand: string): ParsedCurl {
  const trimmed = curlCommand.trim();
  
  // Extract URL - handle both quoted and unquoted
  let url = '';
  const quotedUrlMatch = trimmed.match(/curl\s+(?:[^'"]*\s+)?['"]([^'"]+)['"]/i);
  const unquotedUrlMatch = trimmed.match(/curl\s+(?:[^\s]*\s+)?(https?:\/\/[^\s'"]+)/i);
  
  if (quotedUrlMatch) {
    url = quotedUrlMatch[1];
  } else if (unquotedUrlMatch) {
    url = unquotedUrlMatch[1];
  } else {
    // Try to find URL anywhere in the command
    const anyUrlMatch = trimmed.match(/(https?:\/\/[^\s'"]+)/);
    if (anyUrlMatch) {
      url = anyUrlMatch[1];
    }
  }

  // Extract method
  let method = 'GET';
  const methodMatch = trimmed.match(/-X\s*['"]?(\w+)['"]?/i);
  if (methodMatch) {
    method = methodMatch[1].toUpperCase();
  }

  // Extract headers
  const headers: Record<string, string> = {};
  const headerRegex = /-H\s*['"]([^'"]+)['"]/gi;
  let headerMatch;
  while ((headerMatch = headerRegex.exec(trimmed)) !== null) {
    const headerValue = headerMatch[1];
    const colonIndex = headerValue.indexOf(':');
    if (colonIndex > 0) {
      const key = headerValue.substring(0, colonIndex).trim();
      const value = headerValue.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }

  // Extract body data
  let body: string | null = null;
  const dataMatch = trimmed.match(/(?:-d|--data|--data-raw|--data-binary)\s*['"](.+?)['"]/s);
  if (dataMatch) {
    body = dataMatch[1];
    // If body is present but no explicit method, assume POST
    if (!methodMatch) {
      method = 'POST';
    }
  }

  // Extract original domain
  let originalDomain = '';
  try {
    const urlObj = new URL(url);
    originalDomain = urlObj.origin;
  } catch {
    originalDomain = '';
  }

  return {
    url,
    method,
    headers,
    body,
    originalDomain,
  };
}
