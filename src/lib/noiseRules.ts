/**
 * Per-endpoint noise rules: persistence + canonicalization.
 *
 * The wedge: when a user clicks a "Teach DiffChecker" chip on a noisy field,
 * we save a `NoiseRule` keyed by a canonicalized endpoint. Next time the
 * user runs a diff against the same endpoint, the rule is loaded and the
 * field is rendered collapsed/greyed (see DiffViewer + preprocessJsonForComparison).
 *
 * All persistence is localStorage-only — no backend, ever.
 */

import type { NoiseClassifier } from './smartComparison';

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

const SCHEMA_URL = 'https://diffchecker.dev/rules/v1.json';
const STORAGE_PREFIX = 'diffchecker:rules:';
const MAX_ENDPOINT_LENGTH = 256;

/**
 * Build the localStorage key for a canonicalized endpoint.
 */
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
    // eslint-disable-next-line no-console
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

  // Filter out any rules that don't have the required shape
  return candidate.filter((r): r is NoiseRule => {
    if (!r || typeof r !== 'object') return false;
    const rule = r as Partial<NoiseRule>;
    return (
      typeof rule.path === 'string' &&
      typeof rule.type === 'string' &&
      (rule.source === 'auto' || rule.source === 'manual') &&
      typeof rule.createdAt === 'number'
    );
  });
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

  const validRules: NoiseRule[] = [];
  for (const r of obj.rules) {
    if (!r || typeof r !== 'object') continue;
    const rule = r as Partial<NoiseRule>;
    if (
      typeof rule.path === 'string' &&
      typeof rule.type === 'string' &&
      (rule.source === 'auto' || rule.source === 'manual') &&
      typeof rule.createdAt === 'number'
    ) {
      validRules.push(rule as NoiseRule);
    }
  }

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
