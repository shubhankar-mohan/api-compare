import { detectFieldType, CLASSIFIERS } from './smartComparison';
import type { NoiseRule } from './noiseRules';
import { computeStructuralDiff } from './structuralDiff';

export type DiffLineType = 'added' | 'removed' | 'unchanged' | 'empty' | 'modified';

export interface DiffSegment {
  text: string;
  type: 'unchanged' | 'added' | 'removed';
}

export interface DiffLine {
  content: string;
  type: DiffLineType;
  lineNumber: number | null;
  segments?: DiffSegment[]; // For inline word-level diff
}

export interface DiffResult {
  left: DiffLine[];
  right: DiffLine[];
  additions: number;
  removals: number;
  hasDifferences: boolean;
}

// Maximum number of lines for full LCS (O(m*n) memory/time)
// Beyond this, fall back to a simpler diff to avoid page crashes
const LCS_MAX_LINES = 1500;

// Longest Common Subsequence algorithm for optimal diff
function lcs<T>(a: T[], b: T[]): number[][] {
  const m = a.length;
  const n = b.length;

  // Guard: if inputs are too large, the O(m*n) table will crash the browser
  if (m > LCS_MAX_LINES || n > LCS_MAX_LINES) {
    // Return a dummy DP table that forces simple line-by-line comparison
    // (all zeros means no common subsequence found → every line is a diff)
    return Array(m + 1).fill(null).map(() => [0]);
  }

  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

// Cache for similarity calculations to avoid redundant computations
const similarityCache = new Map<string, number>();

// Calculate similarity between two strings (0-1)
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;
  
  // Create cache key - use full content hash for short strings, sampled for long strings
  const sample1 = str1.length <= 100 ? str1 : `${str1.length}:${str1.substring(0, 50)}:${str1.substring(str1.length - 50)}`;
  const sample2 = str2.length <= 100 ? str2 : `${str2.length}:${str2.substring(0, 50)}:${str2.substring(str2.length - 50)}`;
  const cacheKey = `${sample1}|||${sample2}`;
  
  // Check cache first
  if (similarityCache.has(cacheKey)) {
    return similarityCache.get(cacheKey)!;
  }
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1;
  
  const editDistance = levenshteinDistance(longer, shorter);
  const similarity = (longer.length - editDistance) / longer.length;
  
  // Cache the result (limit cache size to prevent memory issues)
  if (similarityCache.size > 1000) {
    // Clear half the cache to avoid frequent single-item evictions
    const keys = Array.from(similarityCache.keys());
    for (let k = 0; k < 500; k++) {
      similarityCache.delete(keys[k]);
    }
  }
  similarityCache.set(cacheKey, similarity);
  
  return similarity;
}

// Levenshtein distance for string similarity
function levenshteinDistance(str1: string, str2: string): number {
  // Cap input length to avoid massive O(n*m) allocation
  const MAX_LEN = 300;
  const s1 = str1.length > MAX_LEN ? str1.substring(0, MAX_LEN) : str1;
  const s2 = str2.length > MAX_LEN ? str2.substring(0, MAX_LEN) : str2;

  // Use single-row optimization: O(min(m,n)) space instead of O(m*n)
  const a = s1.length > s2.length ? s2 : s1;
  const b = s1.length > s2.length ? s1 : s2;
  const aLen = a.length;
  const bLen = b.length;

  let prev = new Array(aLen + 1);
  let curr = new Array(aLen + 1);

  for (let j = 0; j <= aLen; j++) prev[j] = j;

  for (let i = 1; i <= bLen; i++) {
    curr[0] = i;
    for (let j = 1; j <= aLen; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = Math.min(prev[j - 1] + 1, curr[j - 1] + 1, prev[j] + 1);
      }
    }
    [prev, curr] = [curr, prev];
  }

  return prev[aLen];
}

// Compute character-level diff for more precise highlighting
function computeCharDiff(leftLine: string, rightLine: string): { leftSegments: DiffSegment[]; rightSegments: DiffSegment[] } {
  // Skip character-level diff for very long lines to improve performance
  if (leftLine.length > 500 || rightLine.length > 500) {
    return {
      leftSegments: [{ text: leftLine, type: 'removed' }],
      rightSegments: [{ text: rightLine, type: 'added' }]
    };
  }
  
  const leftChars = leftLine.split('');
  const rightChars = rightLine.split('');
  
  const dp = lcs(leftChars, rightChars);
  
  const leftSegments: DiffSegment[] = [];
  const rightSegments: DiffSegment[] = [];
  
  let i = leftChars.length;
  let j = rightChars.length;
  
  const tempLeft: { char: string; type: 'unchanged' | 'removed' }[] = [];
  const tempRight: { char: string; type: 'unchanged' | 'added' }[] = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftChars[i - 1] === rightChars[j - 1]) {
      tempLeft.unshift({ char: leftChars[i - 1], type: 'unchanged' });
      tempRight.unshift({ char: rightChars[j - 1], type: 'unchanged' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tempRight.unshift({ char: rightChars[j - 1], type: 'added' });
      j--;
    } else if (i > 0) {
      tempLeft.unshift({ char: leftChars[i - 1], type: 'removed' });
      i--;
    }
  }
  
  // Merge consecutive segments of the same type
  const mergeSegments = (
    items: { char: string; type: 'unchanged' | 'removed' | 'added' }[]
  ): DiffSegment[] => {
    const result: DiffSegment[] = [];
    for (const item of items) {
      if (result.length > 0 && result[result.length - 1].type === item.type) {
        result[result.length - 1].text += item.char;
      } else {
        result.push({ text: item.char, type: item.type });
      }
    }
    return result;
  };
  
  return {
    leftSegments: mergeSegments(tempLeft),
    rightSegments: mergeSegments(tempRight),
  };
}

// Compute word-level diff between two strings
function computeWordDiff(leftLine: string, rightLine: string): { leftSegments: DiffSegment[]; rightSegments: DiffSegment[] } {
  // Skip expensive diff for very long lines
  if (leftLine.length > 1000 || rightLine.length > 1000) {
    return {
      leftSegments: [{ text: leftLine, type: 'removed' }],
      rightSegments: [{ text: rightLine, type: 'added' }]
    };
  }
  
  // For better granularity, use character-level diff for lines with any similarity
  const similarity = calculateSimilarity(leftLine, rightLine);
  
  // Use character-level diff for lines with at least 20% similarity for more precise highlighting
  // This will catch JSON property changes, number changes, etc.
  if (similarity > 0.2 && leftLine.length < 500 && rightLine.length < 500) {
    return computeCharDiff(leftLine, rightLine);
  }
  
  // Otherwise, use word-level diff
  const tokenize = (str: string): string[] => {
    const tokens: string[] = [];
    let current = '';
    for (const char of str) {
      if (/\s/.test(char)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        tokens.push(char);
      } else {
        current += char;
      }
    }
    if (current) tokens.push(current);
    return tokens;
  };

  const leftTokens = tokenize(leftLine);
  const rightTokens = tokenize(rightLine);

  const dp = lcs(leftTokens, rightTokens);

  const leftSegments: DiffSegment[] = [];
  const rightSegments: DiffSegment[] = [];

  let i = leftTokens.length;
  let j = rightTokens.length;

  const tempLeft: { token: string; type: 'unchanged' | 'removed' }[] = [];
  const tempRight: { token: string; type: 'unchanged' | 'added' }[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftTokens[i - 1] === rightTokens[j - 1]) {
      tempLeft.unshift({ token: leftTokens[i - 1], type: 'unchanged' });
      tempRight.unshift({ token: rightTokens[j - 1], type: 'unchanged' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tempRight.unshift({ token: rightTokens[j - 1], type: 'added' });
      j--;
    } else if (i > 0) {
      tempLeft.unshift({ token: leftTokens[i - 1], type: 'removed' });
      i--;
    }
  }

  // Merge consecutive segments of the same type
  const mergeSegments = <T extends 'unchanged' | 'removed' | 'added'>(
    items: { token: string; type: T }[]
  ): DiffSegment[] => {
    const result: DiffSegment[] = [];
    for (const item of items) {
      if (result.length > 0 && result[result.length - 1].type === item.type) {
        result[result.length - 1].text += item.token;
      } else {
        result.push({ text: item.token, type: item.type });
      }
    }
    return result;
  };

  return {
    leftSegments: mergeSegments(tempLeft),
    rightSegments: mergeSegments(tempRight),
  };
}

// Simple diff for very small texts with normalization
function computeSimpleDiffWithNormalization(
  leftLines: string[], 
  rightLines: string[],
  leftNormalized: string[],
  rightNormalized: string[]
): DiffResult {
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];
  let additions = 0;
  let removals = 0;
  
  const maxLength = Math.max(leftLines.length, rightLines.length);
  
  for (let i = 0; i < maxLength; i++) {
    if (i < leftLines.length && i < rightLines.length) {
      // Compare normalized versions
      if (leftNormalized[i] === rightNormalized[i]) {
        left.push({ content: leftLines[i], type: 'unchanged', lineNumber: i + 1 });
        right.push({ content: rightLines[i], type: 'unchanged', lineNumber: i + 1 });
      } else {
        left.push({ content: leftLines[i], type: 'removed', lineNumber: i + 1 });
        right.push({ content: rightLines[i], type: 'added', lineNumber: i + 1 });
        removals++;
        additions++;
      }
    } else if (i < leftLines.length) {
      left.push({ content: leftLines[i], type: 'removed', lineNumber: i + 1 });
      right.push({ content: '', type: 'empty', lineNumber: null });
      removals++;
    } else {
      left.push({ content: '', type: 'empty', lineNumber: null });
      right.push({ content: rightLines[i], type: 'added', lineNumber: i + 1 });
      additions++;
    }
  }
  
  return {
    left,
    right,
    additions,
    removals,
    hasDifferences: additions > 0 || removals > 0
  };
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

// Normalize line for comparison
function normalizeLine(line: string, config?: ComparisonConfig): string {
  let normalized = line;
  
  // First, normalize line endings (do this first!)
  normalized = normalized
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, ''); // Remove any line endings within the line
  
  // Remove ALL invisible and problematic Unicode characters
  normalized = normalized
    .replace(/[\u0000-\u001F]/g, '') // Control characters
    .replace(/[\u007F-\u009F]/g, '') // Delete and C1 control codes  
    .replace(/\u200B/g, '')  // Zero-width space
    .replace(/\u200C/g, '')  // Zero-width non-joiner
    .replace(/\u200D/g, '')  // Zero-width joiner
    .replace(/\uFEFF/g, '')  // BOM
    .replace(/\u00A0/g, ' ') // Non-breaking space
    .replace(/[\u2000-\u200A]/g, ' ') // Various Unicode spaces
    .replace(/\u202F/g, ' ') // Narrow no-break space
    .replace(/\u3000/g, ' ') // Ideographic space
    .replace(/[\uE000-\uF8FF]/g, ''); // Private use area
  
  // Convert ALL tabs to spaces consistently
  normalized = normalized.replace(/\t/g, '  ');
  
  // Handle leading whitespace/indentation
  if (config?.normalizeIndentation !== false || config?.formatType === 'yaml') {
    // For YAML and config files, normalize indentation more aggressively
    const match = normalized.match(/^(\s*)(.*)/);
    if (match) {
      const [, indent, content] = match;
      // Count the indent level (treat any 2-5 space group as one indent level)
      const indentLevel = Math.round(indent.length / 2);
      const normalizedIndent = '  '.repeat(indentLevel);
      normalized = normalizedIndent + content;
    }
  }
  
  // Trim trailing whitespace (almost always want this)
  normalized = normalized.trimEnd();
  
  // Additional whitespace handling
  if (config?.ignoreWhitespace) {
    // Complete whitespace normalization
    normalized = normalized.replace(/\s+/g, ' ').trim();
  }
  
  // For YAML files, also normalize quote styles around values
  if (config?.formatType === 'yaml') {
    // Remove quotes around simple values that don't need them
    normalized = normalized.replace(/:\s*["']([^"']*?)["']\s*$/g, ': $1');
    // Normalize spacing around colons
    normalized = normalized.replace(/\s*:\s*/g, ': ');
  }
  
  return normalized;
}

export function computeDiff(leftText: string, rightText: string, options?: { advancedMode?: boolean; config?: ComparisonConfig; rules?: NoiseRule[] }): DiffResult {
  const config = options?.config || {};

  // Check if this is JSON content
  const isJson = isJsonContent(leftText) && isJsonContent(rightText);

  // For JSON content, use structural diff with smart field detection
  if (isJson) {
    return computeSmartJsonDiff(leftText, rightText, config, options?.rules);
  }
  
  // For YAML/config files, use structural diff
  if (config?.formatType === 'yaml' || config?.formatType === 'config') {
    return computeStructuralDiff(leftText, rightText, config);
  }
  
  // Normalize texts for comparison
  const leftNormalized = normalizeLine(leftText, config);
  const rightNormalized = normalizeLine(rightText, config);
  
  // Early exit for identical content after normalization
  if (leftNormalized === rightNormalized) {
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
      hasDifferences: false
    };
  }
  
  const leftLines = leftText.split('\n');
  const rightLines = rightText.split('\n');

  // Create normalized versions for comparison
  const leftNormalizedLines = leftLines.map(line => normalizeLine(line, config));
  const rightNormalizedLines = rightLines.map(line => normalizeLine(line, config));

  // For very large texts, use simple line-by-line diff to avoid O(m*n) crash
  if (leftLines.length > LCS_MAX_LINES || rightLines.length > LCS_MAX_LINES) {
    return computeSimpleDiffWithNormalization(leftLines, rightLines, leftNormalizedLines, rightNormalizedLines);
  }

  // Use simple diff for very small texts - but check if lines are similar first
  if (leftLines.length < 10 && rightLines.length < 10) {
    // Check if we should use advanced diff even for small texts
    let shouldUseAdvanced = false;
    for (let i = 0; i < Math.min(leftLines.length, rightLines.length); i++) {
      // Compare normalized versions
      if (leftNormalizedLines[i] !== rightNormalizedLines[i] && 
          calculateSimilarity(leftNormalizedLines[i], rightNormalizedLines[i]) > 0.2) {
        shouldUseAdvanced = true;
        break;
      }
    }
    
    if (!shouldUseAdvanced) {
      // Use normalized lines for simple diff comparison
      return computeSimpleDiffWithNormalization(leftLines, rightLines, leftNormalizedLines, rightNormalizedLines);
    }
  }

  // Use normalized lines for LCS computation
  const dp = lcs(leftNormalizedLines, rightNormalizedLines);
  
  const left: DiffLine[] = [];
  const right: DiffLine[] = [];
  
  let i = leftLines.length;
  let j = rightLines.length;
  
  const tempLeft: DiffLine[] = [];
  const tempRight: DiffLine[] = [];

  // Track paired modified lines for word-level diff
  const modifiedPairs: { leftIdx: number; rightIdx: number }[] = [];

  // Backtrack through LCS to build diff
  while (i > 0 || j > 0) {
    // Compare normalized versions but display original
    if (i > 0 && j > 0 && leftNormalizedLines[i - 1] === rightNormalizedLines[j - 1]) {
      // Lines match exactly after normalization
      tempLeft.unshift({
        content: leftLines[i - 1],
        type: 'unchanged',
        lineNumber: i,
      });
      tempRight.unshift({
        content: rightLines[j - 1],
        type: 'unchanged',
        lineNumber: j,
      });
      i--;
      j--;
    } else if (i > 0 && j > 0) {
      // Check if lines are similar enough to pair for inline diff
      const leftLine = leftLines[i - 1];
      const rightLine = rightLines[j - 1];
      const leftNormalized = leftNormalizedLines[i - 1];
      const rightNormalized = rightNormalizedLines[j - 1];
      
      // Skip similarity calculation for very long lines or when advanced mode is disabled
      let similarity = 0;
      const useAdvanced = options?.advancedMode !== false;
      
      // Use normalized lines for similarity calculation
      if (useAdvanced && leftNormalized.length < 1000 && rightNormalized.length < 1000) {
        similarity = calculateSimilarity(leftNormalized, rightNormalized);
      }
      
      // Lower threshold to 20% to catch more similar lines
      // Also check for common patterns like JSON property changes
      const hasCommonStructure = (leftLine.includes(':') && rightLine.includes(':')) ||
                                 (leftLine.includes('=') && rightLine.includes('=')) ||
                                 (leftLine.trim().startsWith('{') && rightLine.trim().startsWith('{')) ||
                                 (leftLine.trim().startsWith('[') && rightLine.trim().startsWith('['));
      
      // If lines are at least 20% similar, have common structure, or if we're at a point where both need to be consumed,
      // pair them for inline diff
      if (similarity > 0.2 || hasCommonStructure || dp[i - 1][j] === dp[i][j - 1]) {
        let leftSegments: DiffSegment[] | undefined;
        let rightSegments: DiffSegment[] | undefined;
        
        if (useAdvanced) {
          // Use normalized lines for word diff to avoid false positives
          const result = computeWordDiff(leftNormalized, rightNormalized);
          leftSegments = result.leftSegments;
          rightSegments = result.rightSegments;
        }
        
        // Only mark as modified if there are actual differences in segments
        const hasChanges = useAdvanced && leftSegments && rightSegments && 
                          (leftSegments.some(s => s.type !== 'unchanged') || 
                          rightSegments.some(s => s.type !== 'unchanged'));
        
        if (hasChanges) {
          tempLeft.unshift({
            content: leftLines[i - 1],
            type: 'modified',
            lineNumber: i,
            segments: leftSegments,
          });
          tempRight.unshift({
            content: rightLines[j - 1],
            type: 'modified',
            lineNumber: j,
            segments: rightSegments,
          });
          i--;
          j--;
        } else if (!useAdvanced && leftLines[i - 1] !== rightLines[j - 1]) {
          // Without advanced mode, treat different lines as removed/added
          if (dp[i][j - 1] >= dp[i - 1][j]) {
            tempLeft.unshift({
              content: '',
              type: 'empty',
              lineNumber: null,
            });
            tempRight.unshift({
              content: rightLines[j - 1],
              type: 'added',
              lineNumber: j,
            });
            j--;
          } else {
            tempLeft.unshift({
              content: leftLines[i - 1],
              type: 'removed',
              lineNumber: i,
            });
            tempRight.unshift({
              content: '',
              type: 'empty',
              lineNumber: null,
            });
            i--;
          }
        } else {
          // Lines are identical after normalization
          tempLeft.unshift({
            content: leftLines[i - 1],
            type: 'unchanged',
            lineNumber: i,
          });
          tempRight.unshift({
            content: rightLines[j - 1],
            type: 'unchanged',
            lineNumber: j,
          });
          i--;
          j--;
        }
      } else if (dp[i][j - 1] >= dp[i - 1][j]) {
        // Line added on right
        tempLeft.unshift({
          content: '',
          type: 'empty',
          lineNumber: null,
        });
        tempRight.unshift({
          content: rightLines[j - 1],
          type: 'added',
          lineNumber: j,
        });
        j--;
      } else {
        // Line removed from left
        tempLeft.unshift({
          content: leftLines[i - 1],
          type: 'removed',
          lineNumber: i,
        });
        tempRight.unshift({
          content: '',
          type: 'empty',
          lineNumber: null,
        });
        i--;
      }
    } else if (j > 0) {
      // Line added on right
      tempLeft.unshift({
        content: '',
        type: 'empty',
        lineNumber: null,
      });
      tempRight.unshift({
        content: rightLines[j - 1],
        type: 'added',
        lineNumber: j,
      });
      j--;
    } else if (i > 0) {
      // Line removed from left
      tempLeft.unshift({
        content: leftLines[i - 1],
        type: 'removed',
        lineNumber: i,
      });
      tempRight.unshift({
        content: '',
        type: 'empty',
        lineNumber: null,
      });
      i--;
    }
  }

  left.push(...tempLeft);
  right.push(...tempRight);

  const additions = right.filter(l => l.type === 'added' || l.type === 'modified').length;
  const removals = left.filter(l => l.type === 'removed' || l.type === 'modified').length;

  return {
    left,
    right,
    additions,
    removals,
    hasDifferences: additions > 0 || removals > 0,
  };
}

export function formatJson(text: string): string {
  try {
    const parsed = JSON.parse(text);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return text;
  }
}

// Clear similarity cache when needed (e.g., between different comparisons)
export function clearSimilarityCache(): void {
  similarityCache.clear();
}

export function formatHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

// Check if content is JSON
function isJsonContent(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

// Smart JSON diff that understands field types
function computeSmartJsonDiff(
  leftText: string,
  rightText: string,
  config?: ComparisonConfig,
  rules?: NoiseRule[]
): DiffResult {
  try {
    const leftJson = JSON.parse(leftText);
    const rightJson = JSON.parse(rightText);

    // Format both JSONs
    const leftFormatted = JSON.stringify(leftJson, null, 2);
    const rightFormatted = JSON.stringify(rightJson, null, 2);

    // Preprocess to mark timestamp/ID fields and inject noise-aware markers.
    // Same rule set is applied to both sides so the diff aligns properly.
    const leftProcessed = preprocessJsonForComparison(leftFormatted, rules);
    const rightProcessed = preprocessJsonForComparison(rightFormatted, rules);

    // Use structural diff for better alignment
    return computeStructuralDiff(leftProcessed, rightProcessed, config);
  } catch {
    // Fall back to text diff if JSON parsing fails
    return computeStructuralDiff(leftText, rightText, config);
  }
}

/**
 * Check whether a rule path matches the current JSON path.
 *
 * Rule path syntax (intentionally narrow for v1):
 * - exact match:                "$.data.user.id"
 * - leading wildcard descendant: "$..traceId"   (matches any ancestor)
 * - segment wildcard:            "$.items[*].id" (matches any array index)
 *
 * Both `$..foo` and `$.foo` work for top-level fields. Comparison is
 * case-sensitive. Internal lookup is O(1) per call (one regex per rule
 * compiled lazily and cached on the rule object via WeakMap).
 */
const ruleMatcherCache = new WeakMap<NoiseRule, RegExp | null>();
function ruleMatchesPath(rule: NoiseRule, jsonPath: string): boolean {
  let matcher = ruleMatcherCache.get(rule);
  if (matcher === undefined) {
    matcher = compileRulePath(rule.path);
    ruleMatcherCache.set(rule, matcher);
  }
  if (!matcher) return false;
  // Strip leading `$` from the runtime path so it lines up with the regex
  // (which had the leading `$` stripped at compile time).
  const stripped = jsonPath.startsWith('$') ? jsonPath.slice(1) : jsonPath;
  return matcher.test(stripped);
}

function compileRulePath(rulePath: string): RegExp | null {
  if (!rulePath || typeof rulePath !== 'string') return null;
  let p = rulePath.trim();
  // Strip leading $
  if (p.startsWith('$')) p = p.slice(1);
  if (!p) return /^.*$/;

  // Build a regex from the simplified path
  // Replace `..foo` (descendant) with `(?:.*\.)?foo` so it matches anywhere
  // Replace `[*]` with a digit-index wildcard
  // Escape literal dots and brackets
  let pattern = '';
  let i = 0;
  while (i < p.length) {
    const ch = p[i];
    if (ch === '.' && p[i + 1] === '.') {
      // Descendant marker — match ".x" anywhere from current point
      pattern += '(?:.*\\.)?';
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
 * Preprocess JSON text to inject inline noise-aware markers.
 *
 * Markers:
 * - `/\* TIMESTAMP *\/` — legacy marker for timestamp values (kept for
 *   downstream compatibility).
 * - `/\* ID *\/`        — legacy marker for ID values.
 * - `/\* NOISE:<classifier>:auto *\/` — a classifier matched the value AND
 *   the field name semantically aligns (high-confidence; chip surfaces in UI).
 * - `/\* NOISE:<classifier>:rule *\/` — a saved noise rule applies to this
 *   path (UI renders the line collapsed/greyed).
 *
 * Path tracking: we walk the formatted JSON line-by-line using a
 * 2-space-indent assumption (`JSON.stringify(obj, null, 2)`). We maintain a
 * stack of `{ key, isArray, arrayIndex }` frames keyed by indent depth.
 *
 * Performance: O(n × R) where n is line count and R is rule count. For
 * typical R ≤ 50 this is effectively linear. Markers are appended in place
 * — we never insert new lines, because that would inflate downstream LCS
 * cost (LCS is O(m × n) on line counts; the existing 1500-line guard
 * assumes line counts stay bounded).
 *
 * Exported so unit tests can call it directly.
 */
export function preprocessJsonForComparison(
  jsonText: string,
  rules?: NoiseRule[]
): string {
  const lines = jsonText.split('\n');
  const safeRules = rules && rules.length ? rules : null;

  // Path-tracking stack. Each frame represents one container (object or
  // array). For objects we record the key under which it was opened; for
  // arrays we additionally track the running element index.
  type Frame = { key: string | null; isArray: boolean; arrayIndex: number };
  const stack: Frame[] = [];

  // Helper: compute the JSON path for the current line's field.
  //
  // Walks the stack frames in order. For each frame with a non-null key,
  // append `.key`. For array frames, additionally append `[idx]` for the
  // currently-visited element (we pre-increment on element open, so the
  // active element is at `arrayIndex - 1`).
  //
  // currentKey: the field name of the line we're labeling, or null if
  //   the line is itself an array element with no key.
  function pathFor(currentKey: string | null): string {
    let p = '$';
    for (let idx = 0; idx < stack.length; idx++) {
      const frame = stack[idx];
      if (frame.key !== null) {
        p += `.${frame.key}`;
      }
      if (frame.isArray) {
        // Append [arrayIndex - 1] to indicate the CURRENT element.
        const elementIdx = Math.max(0, frame.arrayIndex - 1);
        p += `[${elementIdx}]`;
      }
    }
    if (currentKey !== null) {
      p += `.${currentKey}`;
    }
    return p;
  }

  const out: string[] = new Array(lines.length);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect the structural shape of this line. JSON.stringify(obj, null, 2)
    // produces predictable forms:
    //   `  "key": value,`
    //   `  "key": value`
    //   `  "key": {`        (object open)
    //   `  "key": [`        (array open)
    //   `  },` `  }` `  ],` `  ]`  (close)
    //   `  value,` or `  value`    (array element, no key)
    //   `  {`              (array element opening object)

    // Field with key + value (may also open object/array with `{` or `[`)
    const fieldMatch = line.match(/^(\s*)"([^"]+)"\s*:\s*(.+)$/);
    // Pure container open without a key (array element that's an object/array)
    const arrayElementOpen = !fieldMatch && /^\s*[{[]\s*$/.test(line);
    // Container close
    const closeMatch = line.match(/^(\s*)([}\]])\s*,?\s*$/);
    // Array element scalar (no key)
    const arrayElementScalar =
      !fieldMatch && !arrayElementOpen && !closeMatch && /^\s*[^\s].*$/.test(line.trim()) && line.trim() !== '';

    let processed = line;

    // Apply noise tagging when this line is a "key: value" pair
    if (fieldMatch) {
      const [, indent, key, valueRaw] = fieldMatch;
      const value = valueRaw.replace(/,\s*$/, '').trim(); // strip trailing comma for classification

      // Only tag if value is a scalar (not opening a container)
      const isContainerOpen = value === '{' || value === '[';
      if (!isContainerOpen) {
        const fieldType = detectFieldType(key, value);
        let appended = '';

        if (fieldType === 'timestamp') {
          const timestampPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}|\d{10,13}/;
          if (timestampPattern.test(value)) {
            appended += ' /* TIMESTAMP */';
          }
        } else if (fieldType === 'id') {
          const idPattern = /"[0-9a-f-]+"|"(usr_|sess_|prod_|req_)[^"]+"/;
          if (idPattern.test(value)) {
            appended += ' /* ID */';
          }
        }

        // Run classifier registry. High-confidence rule: classifier matches
        // value AND `detectFieldType` returns a non-'normal' label. This
        // implements the two-level confidence model from the design doc:
        // we never auto-suggest if only the value matches (medium); we
        // auto-suggest only when both name and value agree (high).
        const valueForClassifier = stripQuotes(value);
        const semanticallyAligned = fieldType !== 'normal';
        if (semanticallyAligned && valueForClassifier !== null) {
          for (const c of CLASSIFIERS) {
            if (c.match(valueForClassifier)) {
              appended += ` /* NOISE:${c.name}:auto */`;
              break;
            }
          }
        }

        // Apply rules whose path matches this field's path
        if (safeRules) {
          const currentPath = pathFor(key);
          for (const rule of safeRules) {
            if (ruleMatchesPath(rule, currentPath)) {
              appended += ` /* NOISE:${rule.type}:rule */`;
              break; // first matching rule wins; precedent doc'd in design
            }
          }
        }

        if (appended) {
          // Preserve original trailing comma if any
          const hadComma = /,\s*$/.test(valueRaw);
          processed = `${indent}"${key}": ${value}${hadComma ? ',' : ''}${appended}`;
        }
      }
    }

    out[i] = processed;

    // ─────────────────────────────────────────────────────────────────────
    // Update the path-tracking stack AFTER processing the line.
    // We update based on what this line OPENS or CLOSES.

    // If the line opens a container (key + `{` or `[`)
    if (fieldMatch) {
      const [, , key, valueRaw] = fieldMatch;
      const value = valueRaw.trim();
      if (value.startsWith('{')) {
        stack.push({ key, isArray: false, arrayIndex: 0 });
      } else if (value.startsWith('[')) {
        // Push array frame; key recorded so the path includes the field name
        stack.push({ key, isArray: true, arrayIndex: 0 });
      }
    } else if (arrayElementOpen) {
      // An object/array element inside an array — increment array index
      // belonging to the parent array frame, then push container frame.
      // The container's "key" is null (no field name).
      const parent = stack[stack.length - 1];
      if (parent && parent.isArray) {
        parent.arrayIndex += 1;
      }
      const trimmed = line.trim();
      if (trimmed.startsWith('{')) {
        stack.push({ key: null, isArray: false, arrayIndex: 0 });
      } else if (trimmed.startsWith('[')) {
        stack.push({ key: null, isArray: true, arrayIndex: 0 });
      }
    } else if (arrayElementScalar) {
      // A scalar value inside an array — bump parent array index
      const parent = stack[stack.length - 1];
      if (parent && parent.isArray) {
        parent.arrayIndex += 1;
      }
    } else if (closeMatch) {
      stack.pop();
    }
  }

  return out.join('\n');
}

// Helper used by preprocessJsonForComparison: strip surrounding double
// quotes from a JSON string-literal value so classifiers see the raw text.
function stripQuotes(value: string): string | null {
  const v = value.trim().replace(/,\s*$/, '');
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    return v.slice(1, -1);
  }
  // Numbers / booleans / null are returned as-is for classifiers that
  // accept them; they generally won't match string-shaped patterns.
  return v;
}
