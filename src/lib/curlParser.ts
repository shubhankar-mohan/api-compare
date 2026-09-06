export interface ParsedCurl {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  originalDomain: string;
}

/**
 * Windows "Copy as cURL (cmd)" escapes with carets: `^"` for a quote, `^&` for
 * an ampersand, and `^` + newline for a continuation. Undo that so the command
 * tokenizes like its bash equivalent. Only applied when the caret-quote form is
 * present, so a bash command containing a literal `^` is left alone.
 */
function normalizeCmdCarets(input: string): string {
  if (!input.includes('^"')) return input;
  return input.replace(/\^\r?\n/g, ' ').replace(/\^(.)/g, '$1');
}

/** One `\xHH` / `\uHHHH` escape inside `$'...'`, or null if not one. */
function ansiCodeEscape(text: string, at: number): { char: string; length: number } | null {
  const m = /^(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4})/.exec(text.slice(at, at + 5));
  if (!m) return null;
  return { char: String.fromCharCode(parseInt(m[1].slice(1), 16)), length: m[1].length };
}

/**
 * Tokenize a curl command string with shell word semantics.
 *
 * A word runs until unquoted whitespace, and quoted runs inside it are
 * concatenated: `'{"name":"O'"'"'Brien"}'` is one word, exactly as bash sees
 * it. The previous tokenizer emitted one token per quoted run, so that
 * apostrophe idiom (and Postman's `'\''`) truncated the body at the quote.
 *
 * - single quotes: no escape processing
 * - double quotes: backslash escapes only `$`, `` ` ``, `"` and `\`
 * - `$'...'`: ANSI-C escapes (`\n`, `\t`, `\xHH`, `\uHHHH`, ...)
 * - unquoted backslash escapes the next character
 */
function tokenize(input: string): string[] {
  const normalized = normalizeCmdCarets(input).replace(/\\\s*\n/g, ' ');
  const tokens: string[] = [];
  const len = normalized.length;
  let i = 0;

  while (i < len) {
    if (/\s/.test(normalized[i])) {
      i++;
      continue;
    }

    let token = '';
    while (i < len && !/\s/.test(normalized[i])) {
      const ch = normalized[i];

      if (ch === "'") {
        i++;
        while (i < len && normalized[i] !== "'") token += normalized[i++];
        i++;
        continue;
      }

      if (ch === '"') {
        i++;
        while (i < len && normalized[i] !== '"') {
          if (normalized[i] === '\\' && i + 1 < len && '$`"\\'.includes(normalized[i + 1])) i++;
          token += normalized[i++];
        }
        i++;
        continue;
      }

      if (ch === '$' && normalized[i + 1] === "'") {
        i += 2;
        while (i < len && normalized[i] !== "'") {
          if (normalized[i] === '\\' && i + 1 < len) {
            i++;
            const code = ansiCodeEscape(normalized, i);
            if (code) {
              token += code.char;
              i += code.length;
              continue;
            }
            switch (normalized[i]) {
              case 'n': token += '\n'; break;
              case 't': token += '\t'; break;
              case 'r': token += '\r'; break;
              case '\\': token += '\\'; break;
              case "'": token += "'"; break;
              case '"': token += '"'; break;
              default: token += '\\' + normalized[i]; break;
            }
            i++;
            continue;
          }
          token += normalized[i++];
        }
        i++;
        continue;
      }

      if (ch === '\\' && i + 1 < len) {
        i++;
        token += normalized[i++];
        continue;
      }

      token += ch;
      i++;
    }
    tokens.push(token);
  }

  return tokens;
}

/**
 * Split glued short options (`-XPUT`, `-H"X: 1"`, `-d'{"a":1}'`) into the
 * option and its argument. Combined no-argument flags (`-sSL`) are left for
 * the main loop, which already recognises them.
 */
const GLUED_ARG_OPTIONS = new Set(['X', 'H', 'd', 'b', 'u', 'A', 'e', 'F', 'o', 'm', 'x']);
function splitGluedOptions(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    if (t.length > 2 && t[0] === '-' && t[1] !== '-' && GLUED_ARG_OPTIONS.has(t[1])) {
      out.push(t.slice(0, 2), t.slice(2));
    } else {
      out.push(t);
    }
  }
  return out;
}

export function parseCurl(curlCommand: string): ParsedCurl {
  const tokens = splitGluedOptions(tokenize(curlCommand.trim()));

  let url = '';
  let method = '';
  let body: string | null = null;
  const headers: Record<string, string> = {};
  let hasJsonFlag = false;
  let sendAsQuery = false; // -G / --get
  const formParts: string[] = []; // -F / --form

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

    // --- Multipart form fields ---
    // The browser cannot rebuild a multipart body from text, but the fields
    // are still the request the user pasted: keep them and imply POST rather
    // than silently sending an empty GET.
    if (token === '--form' || token === '-F' || token === '--form-string') {
      i++;
      if (i < tokens.length) formParts.push(tokens[i]);
      i++;
      continue;
    }

    // --- -G / --get: send -d data as the query string ---
    if (token === '-G' || token === '--get') {
      sendAsQuery = true;
      i++;
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

  if (formParts.length > 0 && body === null) {
    body = formParts.join('&');
  }

  // curl defaults a scheme-less URL to http://
  if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `http://${url}`;
  }

  // -G: the data goes on the URL and the request stays a GET.
  if (sendAsQuery && body !== null) {
    url += (url.includes('?') ? '&' : '?') + body;
    body = null;
    if (!method) method = 'GET';
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
