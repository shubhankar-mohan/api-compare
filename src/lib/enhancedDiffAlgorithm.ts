import { DiffLine, DiffSegment, DiffResult, computeDiff, clearSimilarityCache } from './diffAlgorithm';
import { assertDepthWithinLimit } from './jsonTreeDiff';
import { precisionWarnings } from './diffAlgorithm';
import type { NoiseRule } from './noiseRules';

export interface DiffOptions {
  // Performance options
  advancedMode?: boolean; // Enable character/word-level diffs and structural analysis
  
  // Comparison options
  semanticComparison?: boolean; // Treat "1" and 1 as equal
  ignoreCase?: boolean;
  ignoreWhitespace?: boolean;
  ignoreKeys?: string[];
  ignorePaths?: string[]; // JSONPath-like: ["$.user.id", "$.timestamp"]
  
  // Array comparison
  detectArrayMoves?: boolean;
  arrayKeyField?: string; // Field to use as key for array item comparison (e.g., "id")
  
  // Display options
  showOnlyDifferences?: boolean;
  collapseUnchanged?: boolean;
}

export interface StructuralChange {
  type: 'moved' | 'renamed' | 'type_changed' | 'reordered';
  path: string;
  from?: string | number;
  to?: string | number;
  oldValue?: any;
  newValue?: any;
}

export interface EnhancedDiffResult extends DiffResult {
  structuralChanges: StructuralChange[];
  movedProperties: Map<string, string>;
  statistics: {
    totalKeys: number;
    changedKeys: number;
    addedKeys: number;
    removedKeys: number;
    percentageChanged: number;
    skipped?: boolean;
  };
}

// Line-count threshold above which statistics are skipped and `skipped` is
// set, so the UI can say so instead of showing misleading zeros.
const STATS_MAX_LINES = 3000;

// Helper to normalize values for semantic comparison
function normalizeValue(value: any, options: DiffOptions): any {
  if (options.semanticComparison) {
    // Convert stringified numbers to numbers
    if (typeof value === 'string' && !isNaN(Number(value))) {
      return Number(value);
    }
    // Convert stringified booleans to booleans
    if (value === 'true') return true;
    if (value === 'false') return false;
    // Convert null strings to null
    if (value === 'null') return null;
  }
  
  if (typeof value === 'string') {
    if (options.ignoreWhitespace) value = value.replace(/\s+/g, ' ').trim();
    if (options.ignoreCase) value = value.toLowerCase();
  }

  return value;
}

// Check if a path should be ignored
/**
 * Normalize a JSONPath-ish string to the shape the walkers here build:
 * no leading `$`, no leading `.`.
 *
 * The UI placeholder and the `DiffOptions` docs both show `$.path.to.thing`,
 * but stripping only the `$` left `.path.to.thing` while collected paths carry
 * no leading dot — so the documented form matched nothing, and the only form
 * that actually worked was the undocumented bare one.
 */
function normalizeIgnorePath(raw: string): string {
  return raw.trim().replace(/^\$/, '').replace(/^\./, '');
}

function shouldIgnorePath(path: string, ignorePaths?: string[]): boolean {
  if (!ignorePaths || ignorePaths.length === 0) return false;

  return ignorePaths.some((ignorePath) => {
    // Escape every regex metacharacter except `*`, which stays a wildcard.
    const pattern = normalizeIgnorePath(ignorePath)
      .replace(/[.+?^${}()|[\]\\]/g, (ch) => '\\' + ch)
      .replace(/\*/g, '.*');
    try {
      return new RegExp(`^${pattern}$`).test(path);
    } catch {
      // If regex construction fails, fall back to simple string matching
      return path === normalizeIgnorePath(ignorePath);
    }
  });
}

// Cache for deep equality checks
const deepEqualCache = new Map<string, boolean>();

// Cap on deepEqualCache size. Cache stores booleans by primitive cacheKey;
// 10k entries is comfortably small (booleans + short strings) but high
// enough that real comparisons fit. Mirrors the eviction pattern in
// diffAlgorithm.ts:84-90.
const DEEPEQUAL_CACHE_CAP = 10000;

function cacheDeepEqual(key: string, value: boolean): boolean {
  if (deepEqualCache.size >= DEEPEQUAL_CACHE_CAP) {
    // Map iteration order is insertion order in JS, so dropping the first
    // half drops the oldest entries (LRU-ish for primarily-write workloads).
    const keysToDelete = Array.from(deepEqualCache.keys()).slice(0, DEEPEQUAL_CACHE_CAP / 2);
    for (const k of keysToDelete) deepEqualCache.delete(k);
  }
  deepEqualCache.set(key, value);
  return value;
}

// Deep equality check with options
function deepEqual(a: any, b: any, options: DiffOptions, path: string = ''): boolean {
  // Check if path should be ignored
  if (shouldIgnorePath(path, options.ignorePaths)) {
    return true; // Treat ignored paths as equal
  }

  // Create cache key for primitive values (and remember it so we can
  // populate the cache with the resolved verdict at the end).
  let primitiveCacheKey: string | null = null;
  if (typeof a !== 'object' || typeof b !== 'object') {
    primitiveCacheKey = `${path}:${JSON.stringify(a)}:${JSON.stringify(b)}`;
    if (deepEqualCache.has(primitiveCacheKey)) {
      return deepEqualCache.get(primitiveCacheKey)!;
    }
  }

  // Normalize values
  const normalizedA = normalizeValue(a, options);
  const normalizedB = normalizeValue(b, options);

  // Primitive comparison
  if (normalizedA === normalizedB) {
    return primitiveCacheKey !== null ? cacheDeepEqual(primitiveCacheKey, true) : true;
  }

  // Type check
  if (typeof normalizedA !== typeof normalizedB) {
    // Values are already normalized; if types still differ, they are not equal
    return primitiveCacheKey !== null ? cacheDeepEqual(primitiveCacheKey, false) : false;
  }

  // Null check
  if (normalizedA === null || normalizedB === null) {
    const result = normalizedA === normalizedB;
    return primitiveCacheKey !== null ? cacheDeepEqual(primitiveCacheKey, result) : result;
  }

  // Array comparison
  if (Array.isArray(normalizedA) && Array.isArray(normalizedB)) {
    if (options.detectArrayMoves && options.arrayKeyField) {
      return compareArraysWithKeys(normalizedA, normalizedB, options, path);
    }

    if (normalizedA.length !== normalizedB.length) return false;

    for (let i = 0; i < normalizedA.length; i++) {
      if (!deepEqual(normalizedA[i], normalizedB[i], options, `${path}[${i}]`)) {
        return false;
      }
    }
    return true;
  }

  // Object comparison
  if (typeof normalizedA === 'object' && typeof normalizedB === 'object') {
    const keysA = Object.keys(normalizedA).filter(key => !options.ignoreKeys?.includes(key));
    const keysB = Object.keys(normalizedB).filter(key => !options.ignoreKeys?.includes(key));

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!deepEqual(normalizedA[key], normalizedB[key], options, `${path}.${key}`)) {
        return false;
      }
    }
    return true;
  }

  return primitiveCacheKey !== null ? cacheDeepEqual(primitiveCacheKey, false) : false;
}

// Compare arrays using a key field to detect moves
function compareArraysWithKeys(
  leftArray: any[],
  rightArray: any[],
  options: DiffOptions,
  path: string
): boolean {
  if (!options.arrayKeyField) return false;
  
  const leftMap = new Map();
  const rightMap = new Map();
  
  leftArray.forEach(item => {
    if (item && typeof item === 'object' && options.arrayKeyField! in item) {
      leftMap.set(item[options.arrayKeyField!], item);
    }
  });
  
  rightArray.forEach(item => {
    if (item && typeof item === 'object' && options.arrayKeyField! in item) {
      rightMap.set(item[options.arrayKeyField!], item);
    }
  });
  
  // Check if all items exist (regardless of order)
  if (leftMap.size !== rightMap.size) return false;
  
  for (const [key, leftItem] of leftMap) {
    if (!rightMap.has(key)) return false;
    const rightItem = rightMap.get(key);
    
    // Compare items (excluding the key field for position)
    const leftCopy = { ...leftItem };
    const rightCopy = { ...rightItem };
    
    if (!deepEqual(leftCopy, rightCopy, options, `${path}[${key}]`)) {
      return false;
    }
  }
  
  return true;
}

// Detect structural changes (moves, renames, type changes)
export function detectStructuralChanges(
  left: any,
  right: any,
  options: DiffOptions,
  path: string = ''
): StructuralChange[] {
  const changes: StructuralChange[] = [];
  
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    if (typeof left !== typeof right) {
      changes.push({
        type: 'type_changed',
        path,
        oldValue: typeof left,
        newValue: typeof right
      });
    }
    return changes;
  }
  
  // Array reordering detection
  if (Array.isArray(left) && Array.isArray(right) && options.detectArrayMoves && options.arrayKeyField) {
    const leftIndices = new Map();
    const rightIndices = new Map();
    
    left.forEach((item, index) => {
      if (item && typeof item === 'object' && options.arrayKeyField! in item) {
        leftIndices.set(item[options.arrayKeyField!], index);
      }
    });
    
    right.forEach((item, index) => {
      if (item && typeof item === 'object' && options.arrayKeyField! in item) {
        rightIndices.set(item[options.arrayKeyField!], index);
      }
    });
    
    for (const [key, leftIndex] of leftIndices) {
      if (rightIndices.has(key)) {
        const rightIndex = rightIndices.get(key);
        if (leftIndex !== rightIndex) {
          changes.push({
            type: 'reordered',
            path: `${path}[${key}]`,
            from: leftIndex,
            to: rightIndex
          });
        }
      }
    }
  }
  
  // Object property moves/renames detection
  if (!Array.isArray(left) && !Array.isArray(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    
    // Detect moved properties by comparing values
    const valueSimilarityMap = new Map<string, string[]>();
    
    leftKeys.forEach(leftKey => {
      if (!rightKeys.includes(leftKey)) {
        // Key was removed, check if value appears elsewhere
        rightKeys.forEach(rightKey => {
          if (!leftKeys.includes(rightKey)) {
            // This is a new key, check if values match
            if (deepEqual(left[leftKey], right[rightKey], options)) {
              if (!valueSimilarityMap.has(leftKey)) {
                valueSimilarityMap.set(leftKey, []);
              }
              valueSimilarityMap.get(leftKey)!.push(rightKey);
            }
          }
        });
      }
    });
    
    // Process potential moves
    valueSimilarityMap.forEach((rightKeys, leftKey) => {
      if (rightKeys.length === 1) {
        changes.push({
          type: 'moved',
          path: `${path}.${leftKey}`,
          from: leftKey,
          to: rightKeys[0]
        });
      }
    });
    
    // Continue recursively
    const allKeys = new Set([...leftKeys, ...rightKeys]);
    for (const key of allKeys) {
      if (key in left && key in right) {
        const subChanges = detectStructuralChanges(
          left[key],
          right[key],
          options,
          path ? `${path}.${key}` : key
        );
        changes.push(...subChanges);
      }
    }
  }
  
  return changes;
}

/**
 * Does this rendered row carry a value, as opposed to structural punctuation?
 *
 * `{`, `}`, `[`, `],` and container-opening lines like `"user": {` are
 * scaffolding, not data.
 */
function rowCarriesValue(line: DiffLine): boolean {
  const text = (line.content ?? '').trim();
  if (!text) return false;
  if (/^[[\]{}],?$/.test(text)) return false;
  if (/^"(?:[^"\\]|\\.)*":\s*[[{]$/.test(text)) return false;
  return true;
}

/**
 * Derive statistics from the diff that is actually on screen.
 *
 * The previous implementation re-walked the two objects with `collectKeys`,
 * which built positional array paths (`data[0].orderId`) and counted every
 * ancestor container as a key. Inserting one record at the front of a list
 * therefore shifted every index and reported "100% changed" while the panes
 * correctly showed a single insertion — the two halves of the UI contradicted
 * each other. It also missed keys containing `.` or `[`, because
 * `getValueByPath` split them back apart.
 *
 * Reading the rendered rows makes the number consistent with the picture by
 * construction, and is O(rows) rather than O(keys x depth).
 */
function statisticsFromRows(diff: DiffResult): EnhancedDiffResult['statistics'] {
  let changedKeys = 0;
  let removedKeys = 0;
  let addedKeys = 0;
  let unchangedKeys = 0;

  for (const line of diff.left) {
    if (!rowCarriesValue(line)) continue;
    if (line.type === 'modified') changedKeys++;
    else if (line.type === 'removed') removedKeys++;
    else if (line.type === 'unchanged') unchangedKeys++;
  }
  for (const line of diff.right) {
    if (!rowCarriesValue(line)) continue;
    if (line.type === 'added') addedKeys++;
  }

  const totalKeys = unchangedKeys + changedKeys + removedKeys + addedKeys;
  return {
    totalKeys,
    changedKeys,
    addedKeys,
    removedKeys,
    percentageChanged:
      totalKeys > 0 ? ((changedKeys + addedKeys + removedKeys) / totalKeys) * 100 : 0,
  };
}

// Recursively filter out ignored keys and paths from a JSON object
function filterIgnoredContent(obj: any, options: DiffOptions, path: string): any {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item, index) => filterIgnoredContent(item, options, `${path}[${index}]`));
  }

  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (options.ignoreKeys?.includes(key)) continue;
    const childPath = path ? `${path}.${key}` : key;
    if (shouldIgnorePath(childPath, options.ignorePaths)) continue;
    result[key] = filterIgnoredContent(obj[key], options, childPath);
  }
  return result;
}

// Enhanced diff computation
//
// `rules` is optional. When provided it reaches `computeJsonTreeDiff`, which
// applies each rule to the parsed tree before comparison and marks the rows
// out-of-band via `DiffLine.noise` — never inside `content`.
export function computeEnhancedDiff(
  leftText: string,
  rightText: string,
  options: DiffOptions = {},
  rules?: NoiseRule[]
): EnhancedDiffResult {
  // Clear caches for new comparison
  clearSimilarityCache();
  deepEqualCache.clear();
  
  // Early exit for identical content.
  //
  // Note this path is reachable for inputs that are NOT semantically identical:
  // two different oversized integers round to the same double and therefore
  // format to the same text. Warnings must survive it, or the one signal that
  // something was lost is dropped precisely when it matters most.
  if (leftText === rightText) {
    const lines = leftText.split('\n');
    const unchangedLines: DiffLine[] = lines.map((line, i) => ({
      content: line,
      type: 'unchanged',
      lineNumber: i + 1
    }));
    const earlyWarnings = precisionWarnings(leftText, rightText);
    const earlyDiff: DiffResult = {
      left: unchangedLines,
      right: [...unchangedLines],
      additions: 0,
      removals: 0,
      hasDifferences: false,
    };
    return {
      ...(earlyWarnings.length > 0 ? { warnings: earlyWarnings } : {}),
      left: unchangedLines,
      right: [...unchangedLines],
      additions: 0,
      removals: 0,
      hasDifferences: false,
      structuralChanges: [],
      movedProperties: new Map(),
      statistics: statisticsFromRows(earlyDiff)
    };
  }
  
  // Parse JSON if possible
  let leftObj: any;
  let rightObj: any;
  let isJson = false;
  
  try {
    leftObj = JSON.parse(leftText);
    rightObj = JSON.parse(rightText);
    isJson = true;
  } catch {
    // Fall back to text comparison
    leftObj = leftText;
    rightObj = rightText;
  }

  // detectStructuralChanges, computeDiffStatistics and filterIgnoredContent all
  // recurse without their own depth guards. Checking once here means a
  // pathologically nested response fails with a typed, explainable error
  // instead of a RangeError thrown mid-render.
  if (isJson) {
    assertDepthWithinLimit(leftObj);
    assertDepthWithinLimit(rightObj);
  }
  
  // Skip structural change detection for very large objects or when advanced mode is disabled
  const structuralChanges = isJson && options.advancedMode !== false && JSON.stringify(leftObj).length < 100000 
    ? detectStructuralChanges(leftObj, rightObj, options) 
    : [];
  const movedProperties = new Map<string, string>();
  
  structuralChanges
    .filter(change => change.type === 'moved')
    .forEach(change => {
      movedProperties.set(change.from as string, change.to as string);
    });
  
  // Compute statistics if JSON and advanced mode is enabled.
  // For very large inputs, skip stats and surface a skipped flag so the UI
  // can show "Stats unavailable for large diffs" instead of misleading zeros.
  const leftLineCount = leftText.split('\n').length;
  const rightLineCount = rightText.split('\n').length;
  const statsTooLarge = leftLineCount > STATS_MAX_LINES || rightLineCount > STATS_MAX_LINES;
  const computeStats = isJson && options.advancedMode !== false && !statsTooLarge;
  
  // Filter out ignored keys/paths before formatting for diff display
  if (isJson && (options.ignoreKeys?.length || options.ignorePaths?.length)) {
    leftObj = filterIgnoredContent(leftObj, options, '');
    rightObj = filterIgnoredContent(rightObj, options, '');
  }

  // Format for diff display
  const leftFormatted = isJson ? JSON.stringify(leftObj, null, 2) : leftText;
  const rightFormatted = isJson ? JSON.stringify(rightObj, null, 2) : rightText;
  
  // Use existing diff algorithm for line-by-line comparison
  const basicDiff = computeDiff(leftFormatted, rightFormatted, {
    advancedMode: options.advancedMode,
    rules,
    semanticComparison: options.semanticComparison,
    ignoreCase: options.ignoreCase,
    ignoreWhitespace: options.ignoreWhitespace,
  });

  // Derived from the rows above, so the summary can never contradict the panes.
  const statistics: EnhancedDiffResult['statistics'] = computeStats
    ? statisticsFromRows(basicDiff)
    : {
        totalKeys: 0,
        changedKeys: 0,
        addedKeys: 0,
        removedKeys: 0,
        percentageChanged: 0,
        ...(statsTooLarge && isJson && options.advancedMode !== false ? { skipped: true } : {}),
      };

  return {
    ...basicDiff,
    structuralChanges,
    movedProperties,
    statistics
  };
}

// Search within diff
export function searchInDiff(
  diff: EnhancedDiffResult,
  query: string,
  options: { caseSensitive?: boolean; regex?: boolean } = {}
): { line: number; column: number; side: 'left' | 'right' }[] {
  const results: { line: number; column: number; side: 'left' | 'right' }[] = [];
  
  let searchPattern: RegExp | string = query;
  if (options.regex) {
    try {
      searchPattern = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
    } catch (err) {
      // V8's message already reads "Invalid regular expression: /(/gi: ..."
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(/invalid regular expression/i.test(detail) ? detail : `Invalid regular expression: ${detail}`);
    }
  }
  
  // Search in left side
  diff.left.forEach((line, index) => {
    if (line.content) {
      const content = line.content;
      if (options.regex) {
        const matches = content.matchAll(searchPattern as RegExp);
        for (const match of matches) {
          results.push({
            line: index,
            column: match.index || 0,
            side: 'left'
          });
        }
      } else {
        const searchStr = options.caseSensitive ? content : content.toLowerCase();
        const searchQuery = options.caseSensitive ? query : query.toLowerCase();
        let position = searchStr.indexOf(searchQuery);
        while (position !== -1) {
          results.push({
            line: index,
            column: position,
            side: 'left'
          });
          position = searchStr.indexOf(searchQuery, position + 1);
        }
      }
    }
  });
  
  // Search in right side
  diff.right.forEach((line, index) => {
    if (line.content) {
      const content = line.content;
      if (options.regex) {
        const matches = content.matchAll(searchPattern as RegExp);
        for (const match of matches) {
          results.push({
            line: index,
            column: match.index || 0,
            side: 'right'
          });
        }
      } else {
        const searchStr = options.caseSensitive ? content : content.toLowerCase();
        const searchQuery = options.caseSensitive ? query : query.toLowerCase();
        let position = searchStr.indexOf(searchQuery);
        while (position !== -1) {
          results.push({
            line: index,
            column: position,
            side: 'right'
          });
          position = searchStr.indexOf(searchQuery, position + 1);
        }
      }
    }
  });
  
  return results;
}

/** `b.id`, `.b.id` and `$.b.id` all name the row the tree diff labels `$.b.id`. */
function normalizeJsonPath(raw: string): string {
  const p = raw.trim();
  if (!p) return '';
  if (p.startsWith('$')) return p;
  if (p.startsWith('.') || p.startsWith('[')) return `$${p}`;
  return `$.${p}`;
}

/**
 * Find the row for a JSON path.
 *
 * Rows produced by the tree diff carry their exact path, so `$.b.id` lands
 * on `b.id` and not on the first `id` in the document. The previous version
 * built a RegExp from the last segment of the user's input, which both
 * matched the wrong `id` and threw on any key containing `[` or `(`.
 * Rows without path metadata (text diffs) fall back to a literal search for
 * the last segment as a key.
 */
export function navigateToPath(
  diff: EnhancedDiffResult,
  jsonPath: string
): { line: number; side: 'left' | 'right' } | null {
  const wanted = normalizeJsonPath(jsonPath);
  if (!wanted) return null;

  for (const side of ['left', 'right'] as const) {
    const line = diff[side].findIndex((l) => l.path === wanted);
    if (line !== -1) return { line, side };
  }

  const last = wanted.replace(/(\[\d+\])+$/, '').split('.').pop() ?? '';
  if (!last || last === '$') return null;
  const asJsonKey = `"${last}"`;
  const asBareKey = `${last}:`;
  for (const side of ['left', 'right'] as const) {
    const line = diff[side].findIndex((l) => {
      const c = l.content ?? '';
      return c.includes(asJsonKey) || c.trimStart().startsWith(asBareKey);
    });
    if (line !== -1) return { line, side };
  }
  return null;
}

// Internal helpers exported for tests only.
export const __test = {
  /** Direct deepEqual entrypoint for unit tests of cache eviction. */
  deepEqual: (a: any, b: any, options: DiffOptions = {}, path = ''): boolean =>
    deepEqual(a, b, options, path),
  /** Cache size accessor for unit tests. */
  deepEqualCacheSize: (): number => deepEqualCache.size,
  /** Reset cache between tests. */
  clearDeepEqualCache: (): void => {
    deepEqualCache.clear();
  },
  /** Cap constant for assertions. */
  DEEPEQUAL_CACHE_CAP,
};
