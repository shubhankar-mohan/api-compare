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
│   ├── requestExecutor.ts       # fetch() wrapper for API comparison
│   ├── diffAlgorithm.ts         # LCS-based diff with word/char-level highlighting
│   ├── enhancedDiffAlgorithm.ts # Extended diff with structural change detection
│   ├── structuralDiff.ts        # Config/YAML-aware structural matching
│   └── smartComparison.ts       # Field type detection (timestamps, IDs, etc.)
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
- **Large diffs crash the page:** The LCS algorithm is O(m×n). Always check line count before calling `lcs()`. Fall back to `computeSimpleDiffWithNormalization` for large inputs.
- **Mixed content:** App may be served on HTTPS but users compare against HTTP localhost. The `requestExecutor` detects and shows helpful error messages for this.
- **CORS:** Browser fetch can't bypass CORS. Errors from unreachable servers show as "Failed to fetch" — the executor enhances these messages.

## Branch Info

- **Main branch:** `main`
- **Feature branch:** `feat/apiCompareMode`
