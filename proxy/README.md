# @diffchecker/proxy

A ~250-line, zero-dependency relay that lets [DiffChecker](https://diffchecker.dev) compare
API responses the browser refuses to read.

```bash
npx @diffchecker/proxy
```

Leave it running, then turn on **Use local proxy** in DiffChecker.

---

## Why this is needed

CORS is enforced by the browser on the **response**. If an API doesn't send
`Access-Control-Allow-Origin` naming your page's origin, the browser discards the
response before any JavaScript can see it. Nothing the page does can override that —
it is the security boundary working as designed.

For a diffing tool that is awkward, because:

- **Production APIs will never allow-list a diffing tool.** You often can't change
  their CORS config, and shouldn't want to.
- **Cookies are unavailable.** Browsers forbid scripts from setting the `Cookie`
  header, so a cURL command copied from your browser's network tab goes out
  unauthenticated and comes back 401.

That leaves three ways forward:

| Approach | Works on prod? | Cost |
| --- | --- | --- |
| Ask the API owner to allow-list your origin | Rarely | Not your call |
| CORS-disabling browser extension | Yes | Disables CORS for **every** site in that browser profile |
| **This proxy** | **Yes** | One terminal window |

The proxy isn't a browser, so CORS doesn't apply to it. It makes the request from your
machine and hands the response back to the page with headers the browser accepts.

## What it does and doesn't do

```
your browser  ──▶  127.0.0.1 (this process)  ──▶  the API
```

- Runs entirely on your machine. **No third-party server is involved** — unlike a
  hosted CORS relay, your requests and responses are never visible to anyone else.
- Binds to `127.0.0.1` only, so nothing else on your network can reach it.
- Restores headers the browser forbids: `Cookie`, `Origin`, `User-Agent`, `Referer`.
  Session-authenticated cURL commands work again.
- Reports the real failure cause — DNS, TLS, connection refused — instead of the
  browser's opaque `Failed to fetch`.
- Stores nothing, logs only a one-line summary per request to your terminal, and
  sends no telemetry.
- Stops existing the moment you close the terminal.

## Options

```
  -p, --port <n>            Port to listen on (default 8787)
      --allow-origin <o>    Additional allowed origin; repeatable, or '*'
      --timeout <ms>        Upstream request timeout (default 30000)
  -h, --help
  -v, --version
```

By default only `https://diffchecker.dev` and any `localhost` / `127.0.0.1` origin may
use the proxy. If you self-host DiffChecker somewhere else:

```bash
npx @diffchecker/proxy --allow-origin https://diffchecker.internal.corp
```

## Security notes

This is a developer tool. Treat it accordingly.

- **It is a relay while it runs.** Any page from an allowed origin, open in any tab,
  can ask it to fetch a URL. That's why the origin list is a short default rather than
  `*`, and why binding is loopback-only. Use `--allow-origin '*'` only if you
  understand that any site you visit could then use it.
- **It runs with your network access.** It can reach internal hosts your browser can
  reach, including anything behind your VPN. Stop it when you're done.
- **It forwards credentials you give it.** That's the point — but it means the cURL
  command you paste, cookies included, is sent to the URL in that command.

Compared with a CORS-disabling extension, the blast radius is much smaller: this is
one process, scoped to origins you name, that you can see and kill. An extension
disables the same-origin protection for every site you browse, for as long as it's
enabled.

## Protocol

Two endpoints, both JSON.

```
GET /health
→ 200 {"ok":true,"name":"diffchecker-proxy","version":"1.0.0"}
```

```
POST /proxy
  {"url":"https://api.example.com/v1/me","method":"GET",
   "headers":{"Cookie":"session=abc"},"body":null}

→ 200 {"ok":true,"status":200,"statusText":"OK",
       "headers":{...},"body":"...","responseTime":128}

→ 502 {"ok":false,"error":{"kind":"dns","message":"..."}}
```

`error.kind` is one of `dns`, `refused`, `tls`, `timeout`, `network`, `bad-request`.

Nothing about it is DiffChecker-specific — it's a general local CORS relay if you have
another use for it.

## Publishing

`npx @diffchecker/proxy` only resolves once this package is on the registry:

```bash
cd proxy
npm publish --access public
```

Until then the app also offers a registry-free path — fetch the single file and
run it — so the CORS flow never depends on the publish having happened:

```bash
curl -fsSL https://raw.githubusercontent.com/shubhankar-mohan/api-compare/main/proxy/diffchecker-proxy.mjs -o diffchecker-proxy.mjs
node diffchecker-proxy.mjs
```

## Requirements

Node 18 or newer (uses global `fetch`).

## Browser support

Chrome, Edge, Brave and Firefox treat `http://127.0.0.1` as a trustworthy origin, so an
HTTPS page may call it. **Safari does not**, and will block the request as mixed
content. On Safari, run DiffChecker locally over HTTP or use another browser.

## License

MIT
