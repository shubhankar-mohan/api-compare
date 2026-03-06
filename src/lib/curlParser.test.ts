import { describe, it, expect } from 'vitest';
import { parseCurl } from './curlParser';

describe('curlParser', () => {
  // ──────────────────────────────────────────────
  // Basic URL extraction
  // ──────────────────────────────────────────────
  describe('URL parsing', () => {
    it('parses simple GET with single-quoted URL', () => {
      const result = parseCurl("curl 'https://api.example.com/users'");
      expect(result.url).toBe('https://api.example.com/users');
      expect(result.method).toBe('GET');
    });

    it('parses simple GET with double-quoted URL', () => {
      const result = parseCurl('curl "https://api.example.com/users"');
      expect(result.url).toBe('https://api.example.com/users');
    });

    it('parses unquoted URL', () => {
      const result = parseCurl('curl https://api.example.com/users');
      expect(result.url).toBe('https://api.example.com/users');
    });

    it('parses URL with query parameters', () => {
      const result = parseCurl("curl 'https://api.example.com/search?q=hello&page=1'");
      expect(result.url).toBe('https://api.example.com/search?q=hello&page=1');
    });

    it('parses --url flag', () => {
      const result = parseCurl("curl --url 'https://api.example.com/data'");
      expect(result.url).toBe('https://api.example.com/data');
    });

    it('parses localhost URL', () => {
      const result = parseCurl("curl 'http://localhost:8080/api/test'");
      expect(result.url).toBe('http://localhost:8080/api/test');
    });

    it('parses URL with port', () => {
      const result = parseCurl("curl 'https://api.example.com:3000/v2/data'");
      expect(result.url).toBe('https://api.example.com:3000/v2/data');
    });
  });

  // ──────────────────────────────────────────────
  // HTTP method extraction
  // ──────────────────────────────────────────────
  describe('method parsing', () => {
    it('defaults to GET when no body or method', () => {
      const result = parseCurl("curl 'https://api.example.com/users'");
      expect(result.method).toBe('GET');
    });

    it('parses -X POST', () => {
      const result = parseCurl("curl -X POST 'https://api.example.com/users'");
      expect(result.method).toBe('POST');
    });

    it('parses --request PUT', () => {
      const result = parseCurl("curl --request PUT 'https://api.example.com/users/1'");
      expect(result.method).toBe('PUT');
    });

    it('parses -X DELETE', () => {
      const result = parseCurl("curl -X DELETE 'https://api.example.com/users/1'");
      expect(result.method).toBe('DELETE');
    });

    it('parses -X PATCH', () => {
      const result = parseCurl("curl -X PATCH 'https://api.example.com/users/1'");
      expect(result.method).toBe('PATCH');
    });

    it('infers POST when body is present without -X', () => {
      const result = parseCurl("curl -d '{\"name\":\"test\"}' 'https://api.example.com/users'");
      expect(result.method).toBe('POST');
    });

    it('parses -I / --head as HEAD', () => {
      const result = parseCurl("curl -I 'https://api.example.com/health'");
      expect(result.method).toBe('HEAD');
    });

    it('parses --head as HEAD', () => {
      const result = parseCurl("curl --head 'https://api.example.com/health'");
      expect(result.method).toBe('HEAD');
    });

    it('case-insensitive method', () => {
      const result = parseCurl("curl -X post 'https://api.example.com/users'");
      expect(result.method).toBe('POST');
    });
  });

  // ──────────────────────────────────────────────
  // Header parsing
  // ──────────────────────────────────────────────
  describe('header parsing', () => {
    it('parses -H flag', () => {
      const result = parseCurl("curl -H 'Content-Type: application/json' 'https://api.example.com'");
      expect(result.headers['Content-Type']).toBe('application/json');
    });

    it('parses --header flag', () => {
      const result = parseCurl("curl --header 'Content-Type: application/json' 'https://api.example.com'");
      expect(result.headers['Content-Type']).toBe('application/json');
    });

    it('parses multiple headers', () => {
      const result = parseCurl(`curl -H 'Content-Type: application/json' -H 'Authorization: Bearer token123' 'https://api.example.com'`);
      expect(result.headers['Content-Type']).toBe('application/json');
      expect(result.headers['Authorization']).toBe('Bearer token123');
    });

    it('parses header with lowercase content-type', () => {
      const result = parseCurl("curl --header 'content-type: application/json' 'https://api.example.com'");
      expect(result.headers['content-type']).toBe('application/json');
    });

    it('parses header value with colons (e.g., Authorization)', () => {
      const result = parseCurl("curl -H 'Authorization: Basic dXNlcjpwYXNz' 'https://api.example.com'");
      expect(result.headers['Authorization']).toBe('Basic dXNlcjpwYXNz');
    });

    it('parses double-quoted headers', () => {
      const result = parseCurl('curl -H "Accept: text/html" "https://api.example.com"');
      expect(result.headers['Accept']).toBe('text/html');
    });
  });

  // ──────────────────────────────────────────────
  // Body / data parsing
  // ──────────────────────────────────────────────
  describe('body parsing', () => {
    it('parses -d with simple JSON', () => {
      const result = parseCurl(`curl -d '{"name":"test"}' 'https://api.example.com/users'`);
      expect(result.body).toBe('{"name":"test"}');
    });

    it('parses --data flag', () => {
      const result = parseCurl(`curl --data '{"name":"test"}' 'https://api.example.com/users'`);
      expect(result.body).toBe('{"name":"test"}');
    });

    it('parses --data-raw flag', () => {
      const result = parseCurl(`curl --data-raw '{"name":"test"}' 'https://api.example.com/users'`);
      expect(result.body).toBe('{"name":"test"}');
    });

    it('parses --data-binary flag', () => {
      const result = parseCurl(`curl --data-binary '{"name":"test"}' 'https://api.example.com/users'`);
      expect(result.body).toBe('{"name":"test"}');
    });

    it('parses --data-ascii flag', () => {
      const result = parseCurl(`curl --data-ascii '{"name":"test"}' 'https://api.example.com/users'`);
      expect(result.body).toBe('{"name":"test"}');
    });

    it('parses multiline JSON body (the critical bug case)', () => {
      const curl = `curl --location 'https://text.ti/kb/widget_products' \\
--header 'content-type: application/json' \\
--data '{
  "user_id": "82oXtDgnMadYEZvdUwn3VSFQR273",
  "widget_name": "sale_zoff_t43",
  "widget_id": 3365,
  "widget_type": 56,
  "request_source": "pp::3365::unified",
  "meta": { "app_version": "6.7.1" },
  "data": {
    "give_data_for_product_ids": false,
    "in_stock_only": true,
    "limit": 3,
    "offset": 0,
    "redirect_to_plp": true,
    "remove_navigation": false,
    "seller": "tata",
    "show_recommendations": false,
    "sort_by_rating": true
  }
}'`;
      const result = parseCurl(curl);
      expect(result.url).toBe('https://text.ti/kb/widget_products');
      expect(result.method).toBe('POST');
      expect(result.headers['content-type']).toBe('application/json');
      expect(result.body).toBeTruthy();
      // Verify body is valid JSON
      const parsed = JSON.parse(result.body!);
      expect(parsed.user_id).toBe('82oXtDgnMadYEZvdUwn3VSFQR273');
      expect(parsed.widget_id).toBe(3365);
      expect(parsed.data.limit).toBe(3);
      expect(parsed.data.seller).toBe('tata');
    });

    it('parses body with double quotes containing escaped chars', () => {
      const result = parseCurl('curl -d "{\\"name\\":\\"test\\"}" "https://api.example.com"');
      expect(result.body).toBe('{"name":"test"}');
    });

    it('parses --json flag (sets Content-Type automatically)', () => {
      const result = parseCurl(`curl --json '{"name":"test"}' 'https://api.example.com/users'`);
      expect(result.body).toBe('{"name":"test"}');
      expect(result.headers['Content-Type']).toBe('application/json');
      expect(result.headers['Accept']).toBe('application/json');
      expect(result.method).toBe('POST');
    });

    it('parses --data-urlencode', () => {
      const result = parseCurl("curl --data-urlencode 'name=hello world' 'https://api.example.com/search'");
      expect(result.body).toBe('name=hello%20world');
    });

    it('handles multiple -d flags (concatenated with &)', () => {
      const result = parseCurl("curl -d 'name=foo' -d 'age=30' 'https://api.example.com/users'");
      expect(result.body).toBe('name=foo&age=30');
    });

    it('parses body with nested JSON arrays', () => {
      const curl = `curl --data '{
  "product_ids": ["4045", "4046", "4047", "4058"],
  "tags": [1, 2, 3]
}' 'https://api.example.com/products'`;
      const result = parseCurl(curl);
      const parsed = JSON.parse(result.body!);
      expect(parsed.product_ids).toEqual(["4045", "4046", "4047", "4058"]);
      expect(parsed.tags).toEqual([1, 2, 3]);
    });
  });

  // ──────────────────────────────────────────────
  // Special curl flags
  // ──────────────────────────────────────────────
  describe('special flags', () => {
    it('handles -L / --location (ignored, no crash)', () => {
      const result = parseCurl("curl -L 'https://api.example.com/redirect'");
      expect(result.url).toBe('https://api.example.com/redirect');
      expect(result.method).toBe('GET');
    });

    it('handles --compressed (ignored, no crash)', () => {
      const result = parseCurl("curl --compressed 'https://api.example.com/data'");
      expect(result.url).toBe('https://api.example.com/data');
    });

    it('handles -k / --insecure (ignored, no crash)', () => {
      const result = parseCurl("curl -k 'https://self-signed.example.com/data'");
      expect(result.url).toBe('https://self-signed.example.com/data');
    });

    it('handles -s / --silent (ignored, no crash)', () => {
      const result = parseCurl("curl -s 'https://api.example.com/data'");
      expect(result.url).toBe('https://api.example.com/data');
    });

    it('handles combined short flags -sSL', () => {
      const result = parseCurl("curl -sSL 'https://api.example.com/data'");
      expect(result.url).toBe('https://api.example.com/data');
    });

    it('handles -u / --user for basic auth', () => {
      const result = parseCurl("curl -u 'admin:password123' 'https://api.example.com/admin'");
      expect(result.headers['Authorization']).toMatch(/^Basic /);
    });

    it('handles --user for basic auth', () => {
      const result = parseCurl("curl --user 'admin:password123' 'https://api.example.com/admin'");
      expect(result.headers['Authorization']).toMatch(/^Basic /);
    });

    it('handles -A / --user-agent', () => {
      const result = parseCurl("curl -A 'MyApp/1.0' 'https://api.example.com/data'");
      expect(result.headers['User-Agent']).toBe('MyApp/1.0');
    });

    it('handles -e / --referer', () => {
      const result = parseCurl("curl -e 'https://google.com' 'https://api.example.com/data'");
      expect(result.headers['Referer']).toBe('https://google.com');
    });

    it('handles -b / --cookie', () => {
      const result = parseCurl("curl -b 'session=abc123; token=xyz' 'https://api.example.com/data'");
      expect(result.headers['Cookie']).toBe('session=abc123; token=xyz');
    });

    it('handles flags with arguments that should be skipped (-o, --output)', () => {
      const result = parseCurl("curl -o /tmp/output.json 'https://api.example.com/data'");
      expect(result.url).toBe('https://api.example.com/data');
    });

    it('handles --max-time (skipped with its arg)', () => {
      const result = parseCurl("curl --max-time 30 'https://api.example.com/data'");
      expect(result.url).toBe('https://api.example.com/data');
    });

    it('handles --connect-timeout (skipped with its arg)', () => {
      const result = parseCurl("curl --connect-timeout 5 'https://api.example.com/data'");
      expect(result.url).toBe('https://api.example.com/data');
    });
  });

  // ──────────────────────────────────────────────
  // Line continuation and formatting
  // ──────────────────────────────────────────────
  describe('line continuation', () => {
    it('handles backslash-newline continuation', () => {
      const curl = `curl 'https://api.example.com/data' \\
  -H 'Content-Type: application/json' \\
  -H 'Authorization: Bearer token'`;
      const result = parseCurl(curl);
      expect(result.url).toBe('https://api.example.com/data');
      expect(result.headers['Content-Type']).toBe('application/json');
      expect(result.headers['Authorization']).toBe('Bearer token');
    });

    it('handles Windows-style continuation (backslash-CRLF)', () => {
      const curl = "curl 'https://api.example.com/data' \\\r\n  -H 'Accept: text/html'";
      const result = parseCurl(curl);
      expect(result.url).toBe('https://api.example.com/data');
      expect(result.headers['Accept']).toBe('text/html');
    });
  });

  // ──────────────────────────────────────────────
  // Real-world curl commands (browser copy-paste)
  // ──────────────────────────────────────────────
  describe('real-world curls', () => {
    it('Chrome "Copy as cURL" style', () => {
      const curl = `curl 'https://api.example.com/v2/search?q=test' \\
  -H 'accept: application/json, text/plain, */*' \\
  -H 'accept-language: en-US,en;q=0.9' \\
  -H 'authorization: Bearer eyJhbGciOiJSUzI1NiJ9.eyJ0ZXN0IjoidmFsdWUifQ' \\
  -H 'content-type: application/json' \\
  -H 'origin: https://app.example.com' \\
  -H 'referer: https://app.example.com/' \\
  -H 'user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' \\
  --compressed`;
      const result = parseCurl(curl);
      expect(result.url).toBe('https://api.example.com/v2/search?q=test');
      expect(result.method).toBe('GET');
      expect(result.headers['authorization']).toMatch(/^Bearer /);
      expect(result.headers['content-type']).toBe('application/json');
    });

    it('Chrome "Copy as cURL" with POST body', () => {
      const curl = `curl 'https://api.example.com/graphql' \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer token123' \\
  --data-raw '{"query":"{ user { id name } }","variables":{}}' \\
  --compressed`;
      const result = parseCurl(curl);
      expect(result.url).toBe('https://api.example.com/graphql');
      expect(result.method).toBe('POST');
      const body = JSON.parse(result.body!);
      expect(body.query).toBe('{ user { id name } }');
    });

    it('Postman export style', () => {
      const curl = `curl --location 'https://text.ti/kb/widget_products' \\
--header 'content-type: application/json' \\
--data '{
  "user_id": "82oXtDgnMadYEZvdUwn3VSFQR273",
  "widget_name": "sale_zoff_t43",
  "widget_id": 3103,
  "widget_type": 56,
  "request_source": "pp::3103::unified",
  "meta": { "app_version": "6.7.1" },
  "data": {
    "give_data_for_product_ids": false,
    "in_stock_only": true,
    "limit": 10,
    "offset": 0,
    "product_ids": ["4045", "4046", "4047", "4058"],
    "redirect_to_plp": true,
    "remove_navigation": false,
    "show_recommendations": false,
    "sort_by_rating": true
  }
}'`;
      const result = parseCurl(curl);
      expect(result.url).toBe('https://text.ti/kb/widget_products');
      expect(result.method).toBe('POST');
      expect(result.headers['content-type']).toBe('application/json');
      const body = JSON.parse(result.body!);
      expect(body.data.product_ids).toEqual(["4045", "4046", "4047", "4058"]);
      expect(body.data.limit).toBe(10);
    });

    it('curl with -X and multiple flags combined', () => {
      const curl = `curl -X POST 'https://api.example.com/upload' \\
  -H 'Authorization: Bearer abc123' \\
  -H 'Content-Type: application/json' \\
  -u 'user:pass' \\
  -A 'CustomAgent/2.0' \\
  -b 'sid=abc' \\
  -d '{"file":"data.csv"}' \\
  --compressed \\
  -k \\
  --max-time 60 \\
  --connect-timeout 10`;
      const result = parseCurl(curl);
      expect(result.url).toBe('https://api.example.com/upload');
      expect(result.method).toBe('POST');
      expect(result.headers['Authorization']).toMatch(/^Basic /); // -u overrides -H
      expect(result.headers['Content-Type']).toBe('application/json');
      expect(result.headers['User-Agent']).toBe('CustomAgent/2.0');
      expect(result.headers['Cookie']).toBe('sid=abc');
      expect(result.body).toBe('{"file":"data.csv"}');
    });

    it('minimal curl (just URL)', () => {
      const result = parseCurl('curl https://example.com');
      expect(result.url).toBe('https://example.com');
      expect(result.method).toBe('GET');
      expect(result.body).toBeNull();
    });
  });

  // ──────────────────────────────────────────────
  // Domain extraction
  // ──────────────────────────────────────────────
  describe('originalDomain', () => {
    it('extracts origin from URL', () => {
      const result = parseCurl("curl 'https://api.example.com:3000/v2/data?q=1'");
      expect(result.originalDomain).toBe('https://api.example.com:3000');
    });

    it('returns empty string for invalid URL', () => {
      const result = parseCurl('curl not-a-url');
      expect(result.originalDomain).toBe('');
    });
  });

  // ──────────────────────────────────────────────
  // Edge cases
  // ──────────────────────────────────────────────
  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = parseCurl('');
      expect(result.url).toBe('');
      expect(result.method).toBe('GET');
    });

    it('handles just "curl" with nothing else', () => {
      const result = parseCurl('curl');
      expect(result.url).toBe('');
    });

    it('handles URL with special characters in query', () => {
      const result = parseCurl("curl 'https://api.example.com/search?q=hello%20world&sort=desc'");
      expect(result.url).toBe('https://api.example.com/search?q=hello%20world&sort=desc');
    });

    it('handles $-quoted strings (ANSI-C)', () => {
      const result = parseCurl("curl -d $'line1\\nline2' 'https://api.example.com'");
      expect(result.body).toBe('line1\nline2');
    });

    it('does not crash on unknown flags', () => {
      const result = parseCurl("curl --unknown-flag 'https://api.example.com'");
      expect(result.url).toBe('https://api.example.com');
    });
  });
});
