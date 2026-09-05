import type { ParsedCurl } from './curlParser';

/**
 * The same request, aimed at a local base URL.
 *
 * Built as an object. The page used to re-serialise the parsed command into a
 * shell string (`-d '${body}'`) and parse it again, so any apostrophe in the
 * body or a header truncated the localhost request — `{"name":"O'Brien"}`
 * reached localhost as `{"name":"O` and the two sides compared different
 * requests.
 */
export function toLocalhostRequest(parsed: ParsedCurl, baseUrl: string): ParsedCurl {
  const prod = new URL(parsed.url); // throws on an unusable production URL
  const base = baseUrl.trim().replace(/\/+$/, '');
  const url = `${base}${prod.pathname}${prod.search}`;
  let originalDomain = '';
  try {
    originalDomain = new URL(url).origin;
  } catch {
    originalDomain = '';
  }
  return { ...parsed, headers: { ...parsed.headers }, url, originalDomain };
}
