# DiffChecker TODOS

Items deferred from design doc (2026-04-18) and CEO review (2026-04-18). Each item has context, effort estimate, and priority so it's still actionable when picked up later.

---

## P2 — Add Content-Security-Policy header

**What:** Add a CSP header (or `<meta http-equiv="Content-Security-Policy">` in `index.html`) with a permissive allowlist covering self, AdSense (`script-src` including `googlesyndication.com`, `googleads.g.doubleclick.net`, `google.com`, `googletagmanager.com`), inline styles, and the site itself.

**Why:** No CSP today. AdSense is loaded without an allowlist. If AdSense or any future third-party script is ever compromised, data exfiltration is unrestricted. A permissive-but-present CSP closes the entire class.

**Pros:** Real security posture improvement. Signals care-for-craft to any security-aware engineer evaluating the tool.
**Cons:** Permissive CSP still passes ~everything AdSense wants; gains are real but not dramatic without tightening over time.

**Context:** Raised in /plan-ceo-review Section 3 (Security & Threat Model) on 2026-04-18. User chose to defer. Consider pairing with observability revisit (Section 8) if both come back to the roadmap together.

**Approach to pick up:**
1. Start with Content-Security-Policy-Report-Only header to catch breakages without enforcing.
2. Log violations (console is fine for v1; no report endpoint needed given zero-backend).
3. Tighten after 1-2 weeks of user traffic confirming no real violations from AdSense or the static site itself.

**Effort:** S (human ~45 min / CC ~15 min)
**Priority:** P2
**Depends on:** nothing. Can be done any time.

---

## P3 — Rule viewer virtualization for 500+ rules

**What:** If any single endpoint accumulates 500+ rules in localStorage, the rules viewer panel needs scroll virtualization or pagination. Today's implementation (planned: simple list render) will become laggy.

**Why:** Flagged as an edge case in /plan-ceo-review Section 4 on 2026-04-18. Unlikely to hit in v1 (most endpoints won't accumulate that many rules), but a guaranteed issue for heavy power users over months.

**Pros:** Removes a ceiling. Makes the tool viable for users who really do diff dozens of endpoints daily.
**Cons:** None for v1 since it's unlikely to hit. Don't build yet.

**Context:** The rules viewer is a new UI surface being added in Weekend 1 of the wedge plan. Use `react-window` or `@tanstack/react-virtual` when this becomes real.

**Approach to pick up:** monitor via whatever observability gets added later (or wait for a user to report lag).

**Effort:** S (human ~2h / CC ~30 min)
**Priority:** P3
**Depends on:** Weekend 1 rule viewer shipped.

---

## P3 — CI pipeline with test + build on PR

**What:** Add a GitHub Actions workflow that runs `npm test` + `npm run build` on every PR. No deploy automation needed (Shubhankar deploys manually).

**Why:** User explicitly declined to add CI in /plan-ceo-review Section 9 on 2026-04-18 ("Skip — I handle deploy manually, CI isn't needed"). Captured here so the decision is reviewable later. Becomes more valuable once contributor volume grows beyond Kanika.

**Pros:** Contributor PRs get automated checks. Prevents "looked fine locally, broke on main" surprises. Also sets the foundation for automated npm publish (Weekend 3's package release is currently local-machine-only).

**Cons:** Adds scope for zero immediate user value. Only pays off at contributor scale.

**Context:** Current deploy mechanism is not in repo (no vercel.json, netlify.toml, wrangler.toml, or Actions workflow). All happens via the hosting dashboard manually. At current contributor count, this is fine.

**Approach to pick up:** `.github/workflows/ci.yml` that runs on `pull_request` and `push` to main. Node 20, `npm ci`, `npm test`, `npm run build`. That's it.

**Effort:** S (human ~45 min / CC ~15 min)
**Priority:** P3
**Depends on:** trigger — when next contributor PR after Kanika shows up, or when automated npm publish becomes valuable.
