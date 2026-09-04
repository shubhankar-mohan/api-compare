/**
 * Shared diff types.
 *
 * These live in their own module so that `diffAlgorithm` and `jsonTreeDiff`
 * can both reference them without importing each other for
 * types alone (which would create an import cycle). `diffAlgorithm` re-exports
 * every name here, so existing `from '@/lib/diffAlgorithm'` imports keep working.
 */

export type DiffLineType = 'added' | 'removed' | 'unchanged' | 'empty' | 'modified';

export interface DiffSegment {
  text: string;
  type: 'unchanged' | 'added' | 'removed';
}

/**
 * Why a row is considered noise.
 *
 * This is deliberately a field on the line rather than text inside `content`.
 * The previous design appended `/* NOISE:<type>:<source> *\/` to the rendered
 * text and re-parsed it in the viewer, which meant any API response containing
 * that literal string could forge it: the renderer stripped the "marker" out of
 * the user's own data and displayed a real, counted difference as suppressed
 * noise. An in-band channel cannot be made safe by escaping, so there isn't one.
 *
 * - `rule`   — a saved noise rule matched this path; not counted as a difference.
 * - `auto`   — a classifier suggests this field is noise; still counted.
 * - `legacy` — the opt-in `legacyAutoIgnore` heuristic suppressed it.
 */
export interface NoiseAnnotation {
  type: string;
  source: 'rule' | 'auto' | 'legacy';
}

export interface DiffLine {
  content: string;
  type: DiffLineType;
  lineNumber: number | null;
  segments?: DiffSegment[]; // For inline word-level diff
  /** Noise classification, carried out-of-band. Never present in `content`. */
  noise?: NoiseAnnotation;
  /** Object key this row renders, when it is an object member. */
  fieldKey?: string | null;
}

export interface DiffResult {
  left: DiffLine[];
  right: DiffLine[];
  additions: number;
  removals: number;
  hasDifferences: boolean;
  /**
   * Problems the user must know about even though a diff was produced —
   * chiefly numeric precision loss, where two distinct values can compare
   * equal because JSON numbers are IEEE-754 doubles.
   */
  warnings?: string[];
  /**
   * True when the input exceeded a size guard and was aligned approximately
   * rather than optimally. Without this the UI cannot distinguish "these
   * really are all different" from "we gave up aligning".
   */
  degraded?: boolean;
}

// Configuration for comprehensive comparison
export interface ComparisonConfig {
  ignoreWhitespace?: boolean;
  ignoreTrailingWhitespace?: boolean;
  ignoreLineEndings?: boolean;
  ignoreInvisibleCharacters?: boolean;
  normalizeIndentation?: boolean;
  tabSize?: number;
  formatType?: 'json' | 'yaml' | 'xml' | 'text' | 'config';
}
