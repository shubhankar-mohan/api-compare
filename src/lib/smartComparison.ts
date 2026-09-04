/**
 * Smart comparison features that engineers actually need
 */

/**
 * Classifier name string-union. Used by noise rules and the `CLASSIFIERS`
 * registry below. Keep in sync with the registry. New classifiers added here
 * must also be added to `CLASSIFIERS` and given a `match` function.
 */
export type NoiseClassifier =
  | 'uuid'
  | 'mongo-object-id'
  | 'iso8601'
  | 'epoch-millis'
  | 'jwt'
  | 'hex-hash'
  | 'trace-id'
  | 'session-id'
  | 'request-id'
  | 'semver';

/**
 * Heuristic: does this string look like a JSON Web Token?
 *
 * Three base64url segments separated by dots. The header (first segment) must
 * begin with `eyJ` because the JOSE header is JSON starting with `{` which
 * encodes to `eyJ`. Each segment must be reasonably long (signed tokens have
 * meaningful payloads + signatures). We deliberately avoid signature
 * validation — the goal is "looks like noise," not "is a valid JWT."
 */
export function looksLikeJWT(v: string): boolean {
  if (typeof v !== 'string') return false;
  if (v.length < 20) return false;
  // Strip optional surrounding quotes (callers may pass raw JSON values)
  const trimmed = v.replace(/^"+|"+$/g, '');
  // header.payload.signature — three base64url chunks
  const m = trimmed.match(/^(eyJ[A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/);
  if (!m) return false;
  // Sanity: each section non-trivial; first/header at least 8 chars
  // (any plausible JOSE header), signature at least 8 chars
  if (m[1].length < 8 || m[3].length < 8) return false;
  return true;
}

/**
 * Heuristic: does this string look like a hex hash digest?
 *
 * Match common digest lengths: MD5 (32), SHA-1 (40), SHA-224 (56), SHA-256
 * (64), SHA-384 (96), SHA-512 (128). All-hex, mixed case allowed.
 *
 * False-positive guards:
 * - Excludes UUIDs (32 hex chars when stripped of dashes — but with dashes
 *   they don't match this regex anyway).
 * - Excludes pure decimal numbers (handled by the regex requiring at least
 *   one a-f character — see implementation).
 * - 24-char strings (Mongo ObjectIds) are intentionally NOT matched here —
 *   classified separately as `mongo-object-id`.
 */
export function looksLikeHexHash(v: string): boolean {
  if (typeof v !== 'string') return false;
  // Strip optional surrounding quotes (callers may pass raw JSON values)
  const trimmed = v.replace(/^"+|"+$/g, '');
  // Common digest lengths only — avoids matching arbitrary hex strings
  const validLengths = new Set([32, 40, 56, 64, 96, 128]);
  if (!validLengths.has(trimmed.length)) return false;
  // Must be all hex
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) return false;
  // Must contain at least one alpha char (a-f) — pure-digit strings of
  // these lengths are almost certainly numeric, not hashes
  if (!/[a-fA-F]/.test(trimmed)) return false;
  return true;
}

/**
 * Registry of all classifiers used by the noise-aware diff pipeline.
 *
 * Each entry pairs a short string name (used in rule storage and inline
 * `/* NOISE:<name>:... *\/` markers) with a pure predicate that takes the
 * raw value (string only — non-strings short-circuit to false in each
 * `match`) and returns true if the value matches the classifier's pattern.
 *
 * Order matters for downstream code that wants the FIRST match (e.g. when
 * choosing a single classifier label to attach to a marker). UUIDs come
 * before generic hex hashes because UUIDs are the more specific pattern.
 */
export const CLASSIFIERS: { name: NoiseClassifier; match: (v: string) => boolean }[] = [
  {
    name: 'uuid',
    match: (v) =>
      typeof v === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  },
  {
    name: 'mongo-object-id',
    match: (v) => typeof v === 'string' && /^[0-9a-f]{24}$/.test(v),
  },
  {
    name: 'iso8601',
    match: (v) =>
      typeof v === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.test(v),
  },
  {
    name: 'epoch-millis',
    match: (v) => typeof v === 'string' && /^\d{10,13}$/.test(v),
  },
  {
    name: 'jwt',
    match: looksLikeJWT,
  },
  {
    name: 'hex-hash',
    match: looksLikeHexHash,
  },
  {
    name: 'trace-id',
    match: (v) => typeof v === 'string' && /^(trace|tr|otel)[-_][A-Za-z0-9]{8,}$/i.test(v),
  },
  {
    name: 'session-id',
    match: (v) => typeof v === 'string' && /^sess(ion)?[-_][A-Za-z0-9]{6,}$/i.test(v),
  },
  {
    name: 'request-id',
    match: (v) => typeof v === 'string' && /^req[-_][A-Za-z0-9]{6,}$/i.test(v),
  },
  {
    name: 'semver',
    match: (v) =>
      typeof v === 'string' && /^[v^~]?\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/.test(v),
  },
];

/**
 * Look up a classifier by name. Returns undefined if no classifier matches
 * (rules from older versions that reference unknown classifier names should
 * be quietly ignored — never crash the diff pipeline).
 */
export function getClassifier(name: string): { name: NoiseClassifier; match: (v: string) => boolean } | undefined {
  return CLASSIFIERS.find((c) => c.name === name);
}

// Common patterns to auto-detect and ignore
const SMART_IGNORE_PATTERNS = {
  // Timestamps
  timestamps: [
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,  // ISO 8601
    /^\d{10,13}$/,                            // Unix timestamp
    /_at$/,                                    // Fields ending with _at
    /^(created|updated|modified|deleted)_/,   // Common prefixes
    /^timestamp$/i,
    /^date$/i,
  ],
  
  // IDs and tokens
  identifiers: [
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // UUID
    /^[0-9a-f]{24}$/,                         // MongoDB ObjectId
    /^(request|trace|correlation|session)_id$/i,
    /^(token|session|jwt|bearer)$/i,
    /^sess_[a-zA-Z0-9]+$/,                    // Session ID pattern
    /^req_[a-zA-Z0-9]+$/,                     // Request ID pattern
  ],
  
  // Environment-specific
  environment: [
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0):/,  // Local URLs
    /^https?:\/\/(dev|staging|test|localhost)/, // Non-prod URLs
    /\.(local|dev|test|staging)$/,            // Non-prod domains
  ],
  
  // Versions
  versions: [
    /^\d+\.\d+\.\d+$/,                        // Semantic version
    /^v?\d+\.\d+\.\d+/,                       // Version with v prefix
    /^[\^~]?\d+\.\d+\.\d+/,                   // npm version ranges
  ]
};

/**
 * Detect what type of field this is
 */
export function detectFieldType(key: string, value: any): 'timestamp' | 'id' | 'version' | 'normal' {
  const keyLower = key.toLowerCase();
  
  // Check if it's a timestamp
  if (keyLower.includes('time') || keyLower.includes('date') || 
      keyLower.endsWith('_at') || keyLower.endsWith('_on')) {
    return 'timestamp';
  }
  
  // Check value for timestamp patterns
  if (typeof value === 'string') {
    for (const pattern of SMART_IGNORE_PATTERNS.timestamps) {
      if (pattern.test(value)) return 'timestamp';
    }
  }
  
  // Check if it's an ID
  if (keyLower.includes('id') || keyLower === 'uuid' || 
      keyLower === 'guid' || keyLower.includes('token')) {
    return 'id';
  }
  
  // Check value for ID patterns
  if (typeof value === 'string') {
    for (const pattern of SMART_IGNORE_PATTERNS.identifiers) {
      if (pattern.test(value)) return 'id';
    }
  }
  
  // Check if it's a version
  if (keyLower === 'version' || keyLower.includes('version')) {
    return 'version';
  }
  
  if (typeof value === 'string') {
    for (const pattern of SMART_IGNORE_PATTERNS.versions) {
      if (pattern.test(value)) return 'version';
    }
  }
  
  return 'normal';
}
