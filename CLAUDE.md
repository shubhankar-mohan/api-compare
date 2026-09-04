# CLAUDE.md — DiffChecker Project

## Project Overview

DiffChecker is a privacy-first, browser-based tool for comparing API responses and text content. All processing happens client-side — no data leaves the browser.

**Live modes:**
- **cURL Diff** — Compare API responses between two environments (prod vs localhost, or any two)
- **Text Diff** — Compare any two text blocks with structural diff

## Tech Stack

- **Framework:** React 18 + TypeScript + Vite
- **UI:** shadcn/ui (Radix primitives) + Tailwind CSS
- **Testing:** Vitest + @testing-library/react + jsdom
- **No backend** — pure client-side SPA

## Project Structure

```
src/
├── pages/Index.tsx              # Main page, orchestrates everything
├── components/
│   ├── CurlInput.tsx            # cURL input form (prod-vs-localhost + any-env modes)
│   ├── DiffViewer.tsx           # Side-by-side diff display with search, merge, fold
│   ├── DiffOptions.tsx          # Diff config panel (ignore keys, semantic compare, etc.)
│   ├── TextDiffChecker.tsx      # Text diff mode
│   ├── SummaryCard.tsx          # Response summary (status, time, size)
│   ├── MergeView.tsx            # Merge dialog for combining diffs
│   ├── TroubleshootSection.tsx  # Error display when requests fail
│   ├── FoldableJson.tsx         # Collapsible JSON tree view
│   ├── JsonSyntaxHighlight.tsx  # JSON syntax coloring
│   └── ui/                      # shadcn/ui components (DO NOT edit)
├── lib/
│   ├── curlParser.ts            # Tokenizer-based curl command parser
│   ├── requestExecutor.ts       # Request execution: direct fetch or via local proxy
│   ├── proxyClient.ts           # Local-proxy config, health check, request forwarding
│   ├── errorDiagnostics.ts      # Classifies request failures into actionable kinds
│   ├── diffAlgorithm.ts         # Entry point: routes JSON to tree diff, text to LCS
│   ├── jsonTreeDiff.ts          # Structural diff over PARSED JSON (the main path)
│   ├── diffTypes.ts             # Shared diff types (no imports — breaks cycles)
│   ├── inlineSegments.ts        # Sub-line word/char highlighting + Levenshtein
│   ├── enhancedDiffAlgorithm.ts # Extended diff with structural change detection
│   ├── structuralDiff.ts        # Legacy line matcher — no longer on any live path
│   ├── noiseRules.ts            # Per-endpoint noise rules + JSONPath matching
│   └── smartComparison.ts       # Field type detection (timestamps, IDs, etc.)
proxy/
└── diffchecker-proxy.mjs        # Zero-dep local CORS relay (npx @shubhankar-mohan/diffchecker-proxy)
├── hooks/
│   └── useCurlHistory.ts        # localStorage-based cURL command history
└── test/
    ├── setup.ts                 # Vitest setup (jest-dom matchers)
    └── ui-test-prompts.md       # Manual UI test prompts for Claude Chrome Extension
```

## Commands

```bash
npm run dev          # Start dev server at http://localhost:8080
npm run build        # Production build
npm test             # Run all tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run lint         # ESLint
npx tsc --noEmit     # Type check without emitting
```

## Key Conventions

- **No co-authored-by** in commit messages
- **Commit style:** lowercase imperative (`fix:`, `feat:`, `refactor:`) — see git log
- **Never edit** `src/components/ui/` — these are generated shadcn components
- **All data stays client-side** — never add server endpoints or external data transmission
- **Curl parser uses tokenization**, not regex — handles all curl flags, multiline bodies, quoted strings
- **Diff algorithms have size guards** — LCS capped at 1500 lines, levenshtein at 300 chars to prevent browser crashes
- **Performance matters** — API responses can be very large (1000+ JSON lines). Always consider O(n) implications before adding nested loops in diff code

## Testing

- Unit tests live next to source: `src/lib/*.test.ts`
- UI tests are manual prompts in `src/test/ui-test-prompts.md` — designed for Claude Chrome Extension
- Run `npm test` before committing
- Performance regression tests exist: large diff inputs (2000-3000 lines) must complete in <5 seconds

## Git Workflow & Commit Rules

### Commits
- **Never add co-authored-by** lines to commit messages
- **Format:** `type: short description` — lowercase, imperative mood
  - `fix:` bug fix, `feat:` new feature, `refactor:` restructure, `test:` tests only, `chore:` config/deps
- **Body:** Use bullet points for multi-change commits explaining what and why
- **Only commit when explicitly asked** — do not auto-commit after making changes
- **Run `npm test` before every commit** — do not commit if tests fail

### Pushes
- **Never push unless explicitly asked** — commit and push are separate actions
- **Never force-push** to `main` or shared branches
- **Always confirm** before pushing to remote

### Preserving History
- **Always create new commits** — never amend or squash existing commits unless explicitly asked
- **Never use `git reset --hard`** or `git checkout .` without asking first — these destroy work
- **Never delete branches** without asking
- **If a pre-commit hook fails:** fix the issue and create a NEW commit — do not `--amend` (it would modify the wrong commit)
- **Resolve merge conflicts** properly — never discard changes to make conflicts go away
- **Investigate before deleting** — if you see unfamiliar files, branches, or state, ask before removing. It may be in-progress work.
- **Keep commits atomic** — one logical change per commit. Don't mix unrelated changes.

## Common Pitfalls

- **Curl parsing:** Browser-copied curls use `--header`/`--data-raw`, Postman uses `--location`/`--header`/`--data`. The parser must handle all variants. Never use regex for body extraction — JSON contains quotes that break regex.
- **Never diff JSON as text.** JSON goes through `jsonTreeDiff` — compare the *parsed* values and derive the rendering from the comparison, never the reverse. Diffing `JSON.stringify` output makes trailing commas, key order and indent width semantically significant, and a line matcher cannot represent an insertion (added lines get counted but dropped from the pane). If you are tempted to match rendered lines, read the header comment in `jsonTreeDiff.ts` first.
- **Correctness invariants live in `src/lib/diffCorrectness.test.ts`.** Any change to the diff engine must keep them green: each pane must read back as the document it represents (I1), different values must never report identical (I2), identical values must never report different (I3). Unit tests alone did not catch a silent-wrong-answer class of bug; these do.
- **Size guards are a cell budget, not a line count.** `MAX_LCS_CELLS` / `MAX_ARRAY_LCS_CELLS` (16M cells of `Int32Array` = 64 MB) bound the LCS table. A count-based cap creates an *inverted* cliff — the worst input sits just below the threshold and one line more silently flips to a positional zip that reports a single insertion as a full rewrite (1499 lines: +1/-0 in 82ms; 1500: +751/-750 in 4ms). It also rejected cheap asymmetric inputs like 5000x20. When a budget is exceeded the result sets `degraded: true` so the UI can say the alignment is approximate rather than presenting it as fact. Perf tests must straddle every guard, not just sit above it.
- **Numeric precision loss must be detected on the RAW response body.** `formatJson` round-trips through `JSON.parse`, and an oversized integer is rounded there — two different Snowflake IDs then format to identical text and compare equal. `DiffViewer` scans `original.body`/`localhost.body` and overrides the engine's own warning, because the engine only ever sees post-`formatJson` text where the literal names the already-rounded value. `computeEnhancedDiff`'s identical-text early exit is reachable for *semantically different* input for exactly this reason, so it must carry warnings too.
- **YAML gets no special normalization.** Two lossy rewrites (strip quotes around end-of-line values, collapse every `\s*:\s*`) were dead code while YAML routed through `computeStructuralDiff`; sending YAML down the text path activated them and made YAML mode *worse than plain text* — `"yes"` vs `yes`, `"3"` vs `3`, and invalid `containerPort:8080` all reported "no differences". Do not reintroduce value-level YAML rewrites.
- **Never put metadata inside `DiffLine.content`.** Noise classification travels on `line.noise` / `line.fieldKey`. It used to be appended to the rendered text as `/* NOISE:type:source */` and re-parsed in the viewer, which meant any API response containing that literal string forged one — the renderer deleted it from the user's own data and displayed a real, counted difference as suppressed noise. An in-band channel cannot be made safe by escaping. `content` is verbatim server output.
- **Every recursion over parsed JSON needs a depth guard.** `renderLines`, `walkPair` and `detectStructuralChanges` all recurse; a 27 KB payload nested 3000 deep used to throw `RangeError` from inside a render `useMemo`, i.e. a white screen. `MAX_TREE_DEPTH` (256) plus the iterative `assertDepthWithinLimit` guard them, and `ErrorBoundary` is the backstop. Do not add a fourth unguarded recursion.
- **A rule path that matches everything silences an endpoint forever.** `compileRulePath` used to return `/^.*$/` for an empty path, so `" "`, `"$"` and `"$.."` were catch-alls, and `parseRulesFile` imported them unchecked. Paths now go through `isValidRulePath` on save, load and import, and `..` compiles to the linear `(?:[^.]*\.)*` rather than `(?:.*\.)?`, which backtracked catastrophically.
- **Statistics are derived from the rendered rows, never re-walked.** `statisticsFromRows` counts the diff that is on screen. The old `computeDiffStatistics` re-walked both objects with positional array paths (`data[0].orderId`) and counted ancestor containers, so inserting one record at the front of a list read "100% changed" while the panes correctly showed one insertion — the summary contradicted the picture. Any new summary number must come from the same rows the user is looking at.
- **Array element identity is a heuristic and needs a fallback.** `ID_KEY_CANDIDATES` misses `user_id`, and when the id field is itself what changed (`name`, `sku`, `code`) it cannot help by definition. `pairAdjacentEdits` + `elementSimilarity` fold an adjacent delete/insert run into an in-place edit above `ARRAY_PAIR_THRESHOLD`, mirroring `MODIFIED_PAIR_THRESHOLD` on the text path. Without it a one-field change rendered a 57-line record twice, stacked, with no inline highlight.
- **Options in the Diff panel must reach the rendered diff, not just the stats.** `semanticComparison`, `ignoreCase` and `ignoreWhitespace` are threaded to `jsonTreeDiff` via `normalizeScalar` and affect comparison only — rendering always shows what the server sent. They previously fed `deepEqual` alone, so the panel changed the percentage while the panes ignored it.
- **Heuristic noise suppression is a false-negative machine.** `detectFieldType` matches the substring `"id"`, so `provider`, `paid` and `candidate` are "identifiers"; hex value patterns match any hex-ish string. Suppressing on that basis silently hides real changes, which is far worse than showing noise. It is behind `legacyAutoIgnore`, default off. Keep it that way.
- **Mixed content:** App may be served on HTTPS but users compare against HTTP localhost. `requestExecutor` detects this and explains it. The local proxy also sidesteps it, since browsers treat `http://127.0.0.1` as a trustworthy origin (except Safari).
- **CORS:** browser fetch can't bypass CORS and neither can any client-side trick. For APIs that won't allow-list this origin — i.e. all production APIs — the answer is the local proxy in `proxy/`, which makes the request from the user's machine. `errorDiagnostics` classifies failures; the executor checks once per comparison whether a proxy is already running so the UI can offer "use it" rather than "install it".
- **Browsers silently drop `Cookie`.** The cURL parser reads `-b/--cookie` faithfully and `sanitizeHeadersForFetch` then discards it, turning an authenticated request into an anonymous one. That is unavoidable for a direct fetch, so it must be *surfaced* (see `strippedAuthHeaders`) — the proxy is what actually fixes it.

## Branch Info

- **Main branch:** `main`
- **Feature branch:** `feat/apiCompareMode`
