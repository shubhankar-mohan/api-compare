/**
 * Per-endpoint noise rules: persistence + canonicalization.
 *
 * The wedge: when a user clicks a "Teach DiffChecker" chip on a noisy field,
 * we save a `NoiseRule` keyed by a canonicalized endpoint. Next time the
 * user runs a diff against the same endpoint, the rule is loaded and the
 * field is rendered greyed and not counted (see `jsonTreeDiff` and DiffViewer).
 *
 * All persistence is localStorage-only — no backend, ever.
 */

import { getClassifier, type NoiseClassifier } from './smartComparison';

export type { NoiseClassifier };

/**
 * A single rule. `path` is a JSONPath-ish string ("$.data.traceId" or
 * "$..traceId" for wildcard); `type` is the classifier name; `source` is
 * 'auto' (when DiffChecker auto-detected and the user accepted) or
 * 'manual' (explicitly added by the user via chip click or `i` shortcut).
 *
 * `createdAt` is a ms-epoch timestamp for "X minutes ago" rendering and
 * for stable sort order in the rules viewer.
 */
export interface NoiseRule {
  path: string;
  type: NoiseClassifier;
  source: 'auto' | 'manual';
  createdAt: number;
}

/**
 * The full ruleset for one endpoint. Keyed by `endpoint` (canonicalized).
 */
export interface NoiseRuleSet {
  endpoint: string;
  rules: NoiseRule[];
}

/**
 * Wire format for export/import. Versioned so future schema changes don't
 * silently corrupt user-saved files. v1 ships with this CEO-plan-blessed shape.
 */
export interface NoiseRulesFile {
  $schema: string;
  version: 1;
  endpoint: string;
  rules: NoiseRule[];
}

// An identifier for the file format, not a fetched document. It used to point at
// diffchecker.dev, a domain this project does not own.
const SCHEMA_URL = 'https://github.com/shubhankar-mohan/api-compare/blob/main/docs/rules-file-v1.md';
const STORAGE_PREFIX = 'diffchecker:rules:';
const MAX_ENDPOINT_LENGTH = 256;

/**
 * Check whether a rule's path matches a concrete JSON path.
 *
 * Rule path syntax (intentionally narrow):
 * - exact match:                 "$.data.user.id"
 * - leading wildcard descendant: "$..traceId"    (matches at any depth)
 * - segment wildcard:            "$.items[*].id" (matches any array index)
 *
 * Both `$..foo` and `$.foo` match a top-level field. Comparison is
 * case-sensitive. Each rule's regex is compiled once and cached on the rule
 * object via a WeakMap, so repeated calls during a diff are O(1).
 *
 * Lives here rather than in the diff modules so both the tree diff and the
 * legacy text path can use it without importing each other.
 */
const ruleMatcherCache = new WeakMap<NoiseRule, RegExp | null>();

export function ruleMatchesPath(rule: NoiseRule, jsonPath: string): boolean {
  let matcher = ruleMatcherCache.get(rule);
  if (matcher === undefined) {
    matcher = compileRulePath(rule.path);
    ruleMatcherCache.set(rule, matcher);
  }
  if (!matcher) return false;
  // Strip the leading `$` from the runtime path so it lines up with the regex
  // (which had its leading `$` stripped at compile time).
  const stripped = jsonPath.startsWith('$') ? jsonPath.slice(1) : jsonPath;
  return matcher.test(stripped);
}

/**
 * Maximum descendant (`..`) markers allowed in one rule path.
 *
 * Each marker is an unanchored wildcard. They are compiled to a linear form
 * below, but every extra one still widens what the rule silences, and a path
 * with many of them is far more likely to be hostile or corrupt than intended.
 */
const MAX_DESCENDANT_MARKERS = 3;
const MAX_RULE_PATH_LENGTH = 512;

/**
 * Is this a rule path we are willing to store and apply?
 *
 * This exists because a rule that matches *everything* silences an entire
 * endpoint — the diff reports "no differences" forever while the UI cheerfully
 * shows "1 taught". The old `compileRulePath` returned `/^.*$/` for an empty
 * path, so `" "`, `"$"` and `"$.."` all became catch-alls, and nothing
 * validated a path on import. A rule must therefore name at least one concrete
 * segment; pure-wildcard paths are rejected outright.
 */
export function isValidRulePath(rulePath: unknown): boolean {
  if (typeof rulePath !== 'string') return false;

  const trimmed = rulePath.trim();
  if (!trimmed || trimmed.length > MAX_RULE_PATH_LENGTH) return false;

  const body = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed;
  if (!body) return false; // bare "$"

  // Segments between separators. "$.." and "." leave nothing behind.
  const segments = body.split(/[.[\]]+/).filter(Boolean);
  if (segments.length === 0) return false;

  // "$.*" / "$..*" match every path; they are never a rule a user means.
  if (segments.every((seg) => seg === '*')) return false;

  const descendants = (body.match(/\.\./g) || []).length;
  if (descendants > MAX_DESCENDANT_MARKERS) return false;

  return true;
}

export function compileRulePath(rulePath: string): RegExp | null {
  if (!isValidRulePath(rulePath)) return null;

  let p = rulePath.trim();
  if (p.startsWith('$')) p = p.slice(1);

  let pattern = '';
  let i = 0;
  while (i < p.length) {
    const ch = p[i];

    if (ch === '.' && p[i + 1] === '.') {
      // Descendant marker. Compiled as "(any number of whole segments)".
      //
      // The previous form was `(?:.*\.)?`, whose `.*` can cross segment
      // boundaries; several of those in one anchored pattern backtrack
      // catastrophically on a non-matching path (measured: 3.3s for nine
      // markers). `[^.]*` cannot cross a dot, so this is linear.
      pattern += '(?:[^.]*\\.)*';
      i += 2;
      continue;
    }
    if (ch === '.') {
      pattern += '\\.';
      i += 1;
      continue;
    }
    if (ch === '[' && p[i + 1] === '*' && p[i + 2] === ']') {
      pattern += '\\[\\d+\\]';
      i += 3;
      continue;
    }
    if (ch === '*') {
      // A bare "*" means "one whole segment", not "any characters".
      pattern += '[^.]*';
      i += 1;
      continue;
    }
    if (ch === '[' || ch === ']') {
      pattern += '\\' + ch;
      i += 1;
      continue;
    }
    if ('+?^${}()|\\/'.includes(ch)) {
      pattern += '\\' + ch;
      i += 1;
      continue;
    }
    pattern += ch;
    i += 1;
  }

  try {
    return new RegExp('^' + pattern + '$');
  } catch {
    return null;
  }
}

/**
 * Build the localStorage key for a canonicalized endpoint.
 */
/**
 * Full shape check for a stored or imported rule.
 *
 * Path validity is checked here rather than only at save time so that rules
 * written by an older client — or hand-edited into localStorage — cannot keep
 * silencing an endpoint after this validation was added.
 */
export function isValidRule(candidate: unknown): candidate is NoiseRule {
  if (!candidate || typeof candidate !== 'object') return false;
  const rule = candidate as Partial<NoiseRule>;
  return (
    typeof rule.path === 'string' &&
    isValidRulePath(rule.path) &&
    typeof rule.type === 'string' &&
    getClassifier(rule.type) !== undefined &&
    (rule.source === 'auto' || rule.source === 'manual') &&
    typeof rule.createdAt === 'number' &&
    Number.isFinite(rule.createdAt)
  );
}

export function storageKey(canonical: string): string {
  return `${STORAGE_PREFIX}${canonical}`;
}

/**
 * Canonicalize an endpoint URL for use as a storage key.
 *
 * Steps:
 * - lowercase host
 * - strip userinfo (user:pass@)
 * - strip query string and fragment
 * - collapse repeated slashes in path
 * - strip trailing slash
 * - cap total length at MAX_ENDPOINT_LENGTH
 *
 * Invalid-URL fallback: returns the input lowercased + trimmed + length-capped.
 * This keeps the storage layer functional even when the user pastes a
 * malformed cURL or a relative path.
 */
export function canonicalizeEndpoint(url: string): string {
  if (typeof url !== 'string' || url.length === 0) {
    return '';
  }

  const trimmed = url.trim();

  // Try real URL parsing first
  try {
    // If no protocol, prepend a placeholder so URL() succeeds; we'll strip it back
    const hasProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
    const candidate = hasProtocol ? trimmed : `http://${trimmed}`;
    const u = new URL(candidate);

    // Lowercase host (preserves port if present)
    const host = u.host.toLowerCase();

    // Path: collapse repeated slashes, strip trailing slash
    let path = u.pathname.replace(/\/+/g, '/');
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    if (path === '/') {
      path = '';
    }

    // Drop userinfo, query, fragment, protocol
    let canonical = `${host}${path}`;

    // Trim to max length
    if (canonical.length > MAX_ENDPOINT_LENGTH) {
      canonical = canonical.slice(0, MAX_ENDPOINT_LENGTH);
    }

    return canonical;
  } catch {
    // Fallback: lowercase + trim + cap length
    let safe = trimmed.toLowerCase();
    // Strip query / fragment manually if present
    const qIdx = safe.indexOf('?');
    if (qIdx !== -1) safe = safe.slice(0, qIdx);
    const hIdx = safe.indexOf('#');
    if (hIdx !== -1) safe = safe.slice(0, hIdx);
    safe = safe.replace(/\/+/g, '/').replace(/\/$/, '');
    if (safe.length > MAX_ENDPOINT_LENGTH) {
      safe = safe.slice(0, MAX_ENDPOINT_LENGTH);
    }
    return safe;
  }
}

/**
 * Read rules for an endpoint from localStorage.
 *
 * Returns [] for any of:
 * - localStorage unavailable (private mode, browser disabled)
 * - no entry exists for this endpoint
 * - entry exists but JSON.parse fails (corrupted data)
 * - entry parses but rules array is missing/wrong shape
 *
 * Never throws.
 */
export function loadRules(endpoint: string): NoiseRule[] {
  const canonical = canonicalizeEndpoint(endpoint);
  if (!canonical) return [];

  let raw: string | null = null;
  try {
    if (typeof localStorage === 'undefined') return [];
    raw = localStorage.getItem(storageKey(canonical));
  } catch {
    // localStorage may throw in private mode or when disabled
    return [];
  }

  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[noiseRules] Malformed rule data for ${canonical}, ignoring.`, err);
    return [];
  }

  if (!parsed || typeof parsed !== 'object') return [];

  // Accept either bare-array form or {rules: [...]} wrapped form
  const candidate = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { rules?: unknown }).rules)
    ? (parsed as { rules: unknown[] }).rules
    : null;

  if (!candidate) return [];

  // Drop anything malformed, including paths that would match everything.
  return candidate.filter(isValidRule);
}

/**
 * Persist rules for an endpoint to localStorage.
 *
 * Returns:
 * - `{ ok: true }` on successful write
 * - `{ ok: false, error: <string> }` if the write fails (most common cause:
 *   QuotaExceededError when localStorage is full)
 *
 * Never throws.
 */
export function saveRules(endpoint: string, rules: NoiseRule[]): { ok: boolean; error?: string } {
  const canonical = canonicalizeEndpoint(endpoint);
  if (!canonical) {
    return { ok: false, error: 'Invalid endpoint (canonicalized to empty string).' };
  }

  const payload: NoiseRuleSet = { endpoint: canonical, rules };

  try {
    if (typeof localStorage === 'undefined') {
      return { ok: false, error: 'localStorage is not available in this environment.' };
    }
    localStorage.setItem(storageKey(canonical), JSON.stringify(payload));
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // QuotaExceededError manifests as a DOMException with name 'QuotaExceededError'
    if (err && typeof err === 'object' && 'name' in err && (err as { name?: string }).name === 'QuotaExceededError') {
      return { ok: false, error: `localStorage is full. Export your rules to a file before adding more.` };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Delete a single rule by path. Returns the same `{ok, error?}` shape as `saveRules`.
 */
export function forgetRule(endpoint: string, path: string): { ok: boolean; error?: string } {
  const existing = loadRules(endpoint);
  const next = existing.filter((r) => r.path !== path);
  return saveRules(endpoint, next);
}

/**
 * Add a rule, with merge-by-path semantics. If a rule already exists for
 * `path`, it is replaced (newer rule wins — matches the rule-file import
 * conflict policy in the CEO plan).
 */
export function addRule(endpoint: string, rule: NoiseRule): { ok: boolean; error?: string } {
  if (!isValidRulePath(rule.path)) {
    return {
      ok: false,
      error: `"${rule.path}" is not a usable rule path — it would match every field on this endpoint.`,
    };
  }
  if (!isValidRule(rule)) {
    return { ok: false, error: `Rule for "${rule.path}" is malformed and was not saved.` };
  }
  const existing = loadRules(endpoint);
  const filtered = existing.filter((r) => r.path !== rule.path);
  filtered.push(rule);
  return saveRules(endpoint, filtered);
}

/**
 * Build the wire-format export for an endpoint's rules.
 */
export function exportRulesFile(endpoint: string): NoiseRulesFile {
  const canonical = canonicalizeEndpoint(endpoint);
  return {
    $schema: SCHEMA_URL,
    version: 1,
    endpoint: canonical,
    rules: loadRules(endpoint),
  };
}

/**
 * Parse and validate a wire-format file. Returns `{ ok: true, file }` on
 * success or `{ ok: false, error }` on validation failure.
 *
 * Validation policy (matches CEO plan Rule File Schema section):
 * - missing/wrong `version` → reject with actionable error
 * - unknown `version` (e.g. 2 from a newer client) → reject
 * - missing `rules` array → reject
 * - malformed individual rules → drop them with a warning, but accept the rest
 */
export function parseRulesFile(json: string): { ok: true; file: NoiseRulesFile } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'File must be a JSON object.' };
  }

  const obj = parsed as Partial<NoiseRulesFile>;

  if (typeof obj.version !== 'number') {
    return { ok: false, error: 'File is missing required `version` field.' };
  }

  if (obj.version !== 1) {
    return {
      ok: false,
      error: `This rules file was created with a newer DiffChecker (version ${obj.version}). Update DiffChecker or downgrade the file.`,
    };
  }

  if (!Array.isArray(obj.rules)) {
    return { ok: false, error: 'File is missing required `rules` array.' };
  }

  // Malformed entries are dropped rather than rejecting the whole file, but a
  // path that would silence the endpoint is never imported.
  const validRules: NoiseRule[] = obj.rules.filter(isValidRule);

  return {
    ok: true,
    file: {
      $schema: typeof obj.$schema === 'string' ? obj.$schema : SCHEMA_URL,
      version: 1,
      endpoint: typeof obj.endpoint === 'string' ? obj.endpoint : '',
      rules: validRules,
    },
  };
}
