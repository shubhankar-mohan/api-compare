import { DiffLine, DiffSegment, DiffResult, computeDiff, clearSimilarityCache } from './diffAlgorithm';

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
  };
}

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
  
  if (options.ignoreCase && typeof value === 'string') {
    return value.toLowerCase();
  }
  
  if (options.ignoreWhitespace && typeof value === 'string') {
    return value.replace(/\s+/g, ' ').trim();
  }
  
  return value;
}

// Check if a path should be ignored
function shouldIgnorePath(path: string, ignorePaths?: string[]): boolean {
  if (!ignorePaths || ignorePaths.length === 0) return false;
  
  return ignorePaths.some(ignorePath => {
    // Support wildcard patterns
    const pattern = ignorePath
      .replace(/\$/g, '')
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*');
    return new RegExp(`^${pattern}$`).test(path);
  });
}

// Cache for deep equality checks
const deepEqualCache = new Map<string, boolean>();

// Deep equality check with options
function deepEqual(a: any, b: any, options: DiffOptions, path: string = ''): boolean {
  // Check if path should be ignored
  if (shouldIgnorePath(path, options.ignorePaths)) {
    return true; // Treat ignored paths as equal
  }
  
  // Create cache key for primitive values
  if (typeof a !== 'object' || typeof b !== 'object') {
    const cacheKey = `${path}:${JSON.stringify(a)}:${JSON.stringify(b)}`;
    if (deepEqualCache.has(cacheKey)) {
      return deepEqualCache.get(cacheKey)!;
    }
  }
  
  // Normalize values
  const normalizedA = normalizeValue(a, options);
  const normalizedB = normalizeValue(b, options);
  
  // Primitive comparison
  if (normalizedA === normalizedB) return true;
  
  // Type check
  if (typeof normalizedA !== typeof normalizedB) {
    // Semantic comparison might make different types equal
    if (options.semanticComparison) {
      return normalizeValue(normalizedA, options) === normalizeValue(normalizedB, options);
    }
    return false;
  }
  
  // Null check
  if (normalizedA === null || normalizedB === null) return normalizedA === normalizedB;
  
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
  
  return false;
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

// Compute statistics for the diff
function computeDiffStatistics(left: any, right: any, options: DiffOptions): EnhancedDiffResult['statistics'] {
  const leftKeys = new Set<string>();
  const rightKeys = new Set<string>();
  
  // Collect all keys recursively
  function collectKeys(obj: any, prefix: string = '', targetSet: Set<string>) {
    if (obj === null || obj === undefined) return;
    
    if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          collectKeys(item, `${prefix}[${index}]`, targetSet);
        });
      } else {
        Object.keys(obj).forEach(key => {
          if (!options.ignoreKeys?.includes(key)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (!shouldIgnorePath(path, options.ignorePaths)) {
              targetSet.add(path);
              collectKeys(obj[key], path, targetSet);
            }
          }
        });
      }
    } else {
      targetSet.add(prefix);
    }
  }
  
  collectKeys(left, '', leftKeys);
  collectKeys(right, '', rightKeys);
  
  const allKeys = new Set([...leftKeys, ...rightKeys]);
  const addedKeys = [...rightKeys].filter(key => !leftKeys.has(key));
  const removedKeys = [...leftKeys].filter(key => !rightKeys.has(key));
  const commonKeys = [...leftKeys].filter(key => rightKeys.has(key));
  
  let changedKeys = 0;
  commonKeys.forEach(key => {
    const leftValue = getValueByPath(left, key);
    const rightValue = getValueByPath(right, key);
    if (!deepEqual(leftValue, rightValue, options, key)) {
      changedKeys++;
    }
  });
  
  return {
    totalKeys: allKeys.size,
    changedKeys,
    addedKeys: addedKeys.length,
    removedKeys: removedKeys.length,
    percentageChanged: allKeys.size > 0 ? ((changedKeys + addedKeys.length + removedKeys.length) / allKeys.size) * 100 : 0
  };
}

// Get value by path (e.g., "a.b[0].c")
function getValueByPath(obj: any, path: string): any {
  const segments = path.split(/\.|\[|\]/).filter(Boolean);
  let current = obj;
  
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    current = current[segment];
  }
  
  return current;
}

// Enhanced diff computation
export function computeEnhancedDiff(
  leftText: string,
  rightText: string,
  options: DiffOptions = {}
): EnhancedDiffResult {
  // Clear similarity cache for new comparison
  clearSimilarityCache();
  
  // Early exit for identical content
  if (leftText === rightText) {
    const lines = leftText.split('\n');
    const unchangedLines: DiffLine[] = lines.map((line, i) => ({
      content: line,
      type: 'unchanged',
      lineNumber: i + 1
    }));
    return {
      left: unchangedLines,
      right: [...unchangedLines],
      additions: 0,
      removals: 0,
      hasDifferences: false,
      structuralChanges: [],
      movedProperties: new Map(),
      statistics: {
        totalKeys: 0,
        changedKeys: 0,
        addedKeys: 0,
        removedKeys: 0,
        percentageChanged: 0
      }
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
  
  // Compute statistics if JSON and advanced mode is enabled
  const statistics = isJson && options.advancedMode !== false ? computeDiffStatistics(leftObj, rightObj, options) : {
    totalKeys: 0,
    changedKeys: 0,
    addedKeys: 0,
    removedKeys: 0,
    percentageChanged: 0
  };
  
  // Format for diff display
  const leftFormatted = isJson ? JSON.stringify(leftObj, null, 2) : leftText;
  const rightFormatted = isJson ? JSON.stringify(rightObj, null, 2) : rightText;
  
  // Use existing diff algorithm for line-by-line comparison
  const basicDiff = computeDiff(leftFormatted, rightFormatted, { advancedMode: options.advancedMode });
  
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
  
  const searchPattern = options.regex
    ? new RegExp(query, options.caseSensitive ? 'g' : 'gi')
    : query;
  
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

// Navigate to specific JSON path
export function navigateToPath(
  diff: EnhancedDiffResult,
  jsonPath: string
): { line: number; side: 'left' | 'right' } | null {
  // Convert JSONPath to line number in the diff
  const pathPattern = jsonPath
    .replace(/\$/g, '')
    .replace(/\[(\d+)\]/g, '\\[$1\\]')
    .replace(/\./g, '\\.');
  
  // Search for the path in the diff
  const leftMatch = diff.left.findIndex(line =>
    line.content && new RegExp(`"${pathPattern.split('.').pop()}"`).test(line.content)
  );
  
  if (leftMatch !== -1) {
    return { line: leftMatch, side: 'left' };
  }
  
  const rightMatch = diff.right.findIndex(line =>
    line.content && new RegExp(`"${pathPattern.split('.').pop()}"`).test(line.content)
  );
  
  if (rightMatch !== -1) {
    return { line: rightMatch, side: 'right' };
  }
  
  return null;
}