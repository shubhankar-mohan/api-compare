export interface ParsedCurl {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  originalDomain: string;
}

/**
 * Tokenize a curl command string, handling quoted strings (single and double),
 * backslash line continuations, and escaped characters.
 */
function tokenize(input: string): string[] {
  // Normalize line continuations: backslash followed by newline
  const normalized = input.replace(/\\\s*\n/g, ' ');

  const tokens: string[] = [];
  let i = 0;
  const len = normalized.length;

  while (i < len) {
    // Skip whitespace
    if (/\s/.test(normalized[i])) {
      i++;
      continue;
    }

    // Single-quoted string: no escape processing inside
    if (normalized[i] === "'") {
      i++; // skip opening quote
      let token = '';
      while (i < len && normalized[i] !== "'") {
        token += normalized[i];
        i++;
      }
      i++; // skip closing quote
      tokens.push(token);
      continue;
    }

    // Double-quoted string: handle backslash escapes
    if (normalized[i] === '"') {
      i++; // skip opening quote
      let token = '';
      while (i < len && normalized[i] !== '"') {
        if (normalized[i] === '\\' && i + 1 < len) {
          i++;
          token += normalized[i];
        } else {
          token += normalized[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push(token);
      continue;
    }

    // $'...' ANSI-C quoting (used by some browser "copy as cURL")
    if (normalized[i] === '$' && i + 1 < len && normalized[i + 1] === "'") {
      i += 2; // skip $'
      let token = '';
      while (i < len && normalized[i] !== "'") {
        if (normalized[i] === '\\' && i + 1 < len) {
          i++;
          switch (normalized[i]) {
            case 'n': token += '\n'; break;
            case 't': token += '\t'; break;
            case 'r': token += '\r'; break;
            case '\\': token += '\\'; break;
            case "'": token += "'"; break;
            default: token += '\\' + normalized[i]; break;
          }
        } else {
          token += normalized[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push(token);
      continue;
    }

    // Unquoted token
    let token = '';
    while (i < len && !/\s/.test(normalized[i])) {
      if (normalized[i] === '\\' && i + 1 < len) {
        i++;
        token += normalized[i];
      } else {
        token += normalized[i];
      }
      i++;
    }
    tokens.push(token);
  }

  return tokens;
}

export function parseCurl(curlCommand: string): ParsedCurl {
  const tokens = tokenize(curlCommand.trim());

  let url = '';
  let method = '';
  let body: string | null = null;
  const headers: Record<string, string> = {};
  let hasJsonFlag = false;

  let i = 0;

  // Skip 'curl' if first token
  if (tokens.length > 0 && tokens[0].toLowerCase() === 'curl') {
    i = 1;
  }

  while (i < tokens.length) {
    const token = tokens[i];

    // --- Method ---
    if (token === '-X' || token === '--request') {
      i++;
      if (i < tokens.length) {
        method = tokens[i].toUpperCase();
      }
      i++;
      continue;
    }

    // --- Headers ---
    if (token === '-H' || token === '--header') {
      i++;
      if (i < tokens.length) {
        const headerStr = tokens[i];
        const colonIndex = headerStr.indexOf(':');
        if (colonIndex > 0) {
          const key = headerStr.substring(0, colonIndex).trim();
          const value = headerStr.substring(colonIndex + 1).trim();
          headers[key] = value;
        }
      }
      i++;
      continue;
    }

    // --- Body data flags ---
    // -d, --data, --data-raw, --data-binary, --data-ascii all send body as-is
    if (token === '-d' || token === '--data' || token === '--data-raw' ||
        token === '--data-binary' || token === '--data-ascii') {
      i++;
      if (i < tokens.length) {
        const data = tokens[i];
        // -d/--data with @ reads from file; in browser we just pass it as-is
        body = body ? body + '&' + data : data;
      }
      i++;
      continue;
    }

    // --data-urlencode: URL-encodes the value
    if (token === '--data-urlencode') {
      i++;
      if (i < tokens.length) {
        const data = tokens[i];
        // Format: name=content or =content or content or name@filename
        const encoded = data.includes('=')
          ? data.substring(0, data.indexOf('=') + 1) + encodeURIComponent(data.substring(data.indexOf('=') + 1))
          : encodeURIComponent(data);
        body = body ? body + '&' + encoded : encoded;
      }
      i++;
      continue;
    }

    // --json: shortcut that sets Content-Type and Accept headers, sends POST
    if (token === '--json') {
      i++;
      if (i < tokens.length) {
        body = tokens[i];
        hasJsonFlag = true;
      }
      i++;
      continue;
    }

    // --- URL via --url flag ---
    if (token === '--url') {
      i++;
      if (i < tokens.length) {
        url = tokens[i];
      }
      i++;
      continue;
    }

    // --- User agent ---
    if (token === '-A' || token === '--user-agent') {
      i++;
      if (i < tokens.length) {
        headers['User-Agent'] = tokens[i];
      }
      i++;
      continue;
    }

    // --- Referer ---
    if (token === '-e' || token === '--referer') {
      i++;
      if (i < tokens.length) {
        headers['Referer'] = tokens[i];
      }
      i++;
      continue;
    }

    // --- Cookie ---
    if (token === '-b' || token === '--cookie') {
      i++;
      if (i < tokens.length) {
        headers['Cookie'] = tokens[i];
      }
      i++;
      continue;
    }

    // --- Basic auth ---
    if (token === '-u' || token === '--user') {
      i++;
      if (i < tokens.length) {
        const credentials = tokens[i];
        try {
          headers['Authorization'] = 'Basic ' + btoa(credentials);
        } catch {
          headers['Authorization'] = 'Basic ' + credentials;
        }
      }
      i++;
      continue;
    }

    // --- Content-Type shorthand ---
    if (token === '--form' || token === '-F') {
      // multipart/form-data — skip for now, just consume the arg
      i += 2;
      continue;
    }

    // --- Flags that take no argument (just skip) ---
    if (token === '-L' || token === '--location' ||
        token === '-k' || token === '--insecure' ||
        token === '-s' || token === '--silent' ||
        token === '-S' || token === '--show-error' ||
        token === '-v' || token === '--verbose' ||
        token === '-i' || token === '--include' ||
        token === '-I' || token === '--head' ||
        token === '-N' || token === '--no-buffer' ||
        token === '--compressed' ||
        token === '--location-trusted' ||
        token === '-f' || token === '--fail' ||
        token === '--fail-with-body' ||
        token === '-g' || token === '--globoff' ||
        token === '-0' || token === '--http1.0' ||
        token === '--http1.1' || token === '--http2' ||
        token === '--raw' || token === '--tr-encoding' ||
        token === '--tcp-nodelay' || token === '--no-keepalive') {
      // --head implies HEAD method
      if (token === '-I' || token === '--head') {
        if (!method) method = 'HEAD';
      }
      i++;
      continue;
    }

    // --- Flags that take one argument (skip the flag + its value) ---
    if (token === '-o' || token === '--output' ||
        token === '-O' || token === '--remote-name' ||
        token === '-w' || token === '--write-out' ||
        token === '-c' || token === '--cookie-jar' ||
        token === '-D' || token === '--dump-header' ||
        token === '-m' || token === '--max-time' ||
        token === '--connect-timeout' ||
        token === '-r' || token === '--range' ||
        token === '-T' || token === '--upload-file' ||
        token === '-E' || token === '--cert' ||
        token === '--cacert' || token === '--capath' ||
        token === '--key' || token === '--pass' ||
        token === '--proxy' || token === '-x' ||
        token === '--proxy-user' ||
        token === '--resolve' ||
        token === '--retry' || token === '--retry-delay' ||
        token === '--limit-rate' ||
        token === '-Y' || token === '--speed-limit' ||
        token === '-y' || token === '--speed-time' ||
        token === '--interface' || token === '--local-port' ||
        token === '--max-redirs' ||
        token === '--noproxy') {
      i += 2; // skip flag + argument
      continue;
    }

    // --- Combined short flags like -sL, -sSL, etc ---
    if (token.startsWith('-') && !token.startsWith('--') && token.length > 2) {
      // Could be combined short flags like -sSLk
      // Check if all characters are known no-arg flags
      const flagChars = token.substring(1);
      const noArgFlags = new Set(['L', 'k', 's', 'S', 'v', 'i', 'I', 'N', 'f', 'g', '0']);
      const allNoArg = [...flagChars].every(c => noArgFlags.has(c));
      if (allNoArg) {
        if (flagChars.includes('I')) {
          if (!method) method = 'HEAD';
        }
        i++;
        continue;
      }
      // Otherwise it might be like -H'Header: value' (no space) — uncommon but possible
    }

    // --- Positional argument: likely a URL ---
    if (!token.startsWith('-') && !url) {
      url = token;
      i++;
      continue;
    }

    // Unknown flag — skip
    i++;
  }

  // Apply --json semantics
  if (hasJsonFlag) {
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (!headers['Accept'] && !headers['accept']) {
      headers['Accept'] = 'application/json';
    }
  }

  // Infer method
  if (!method) {
    if (body) {
      method = 'POST';
    } else {
      method = 'GET';
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
