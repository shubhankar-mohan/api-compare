import { detectFieldType } from './smartComparison';
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

// Longest Common Subsequence algorithm for optimal diff
function lcs<T>(a: T[], b: T[]): number[][] {
  const m = a.length;
  const n = b.length;
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
  
  // Create cache key based on string characteristics
  const cacheKey = `${str1.length}:${str2.length}:${str1.substring(0, 20)}:${str2.substring(0, 20)}`;
  
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
    // Clear oldest entries
    const firstKey = similarityCache.keys().next().value;
    similarityCache.delete(firstKey);
  }
  similarityCache.set(cacheKey, similarity);
  
  return similarity;
}

// Levenshtein distance for string similarity
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
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

// Simple diff for very small texts (legacy - kept for backward compatibility)
function computeSimpleDiff(leftLines: string[], rightLines: string[]): DiffResult {
  // Use same normalized lines (no normalization)
  return computeSimpleDiffWithNormalization(leftLines, rightLines, leftLines, rightLines);
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
      // Normalize the indentation (convert 4 spaces to 2, standardize)
      const normalizedIndent = indent
        .replace(/    /g, '  ') // 4 spaces to 2
        .replace(/   /g, '  ')  // 3 spaces to 2
        .replace(/     /g, '  '); // 5 spaces to 2
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

export function computeDiff(leftText: string, rightText: string, options?: { advancedMode?: boolean; config?: ComparisonConfig }): DiffResult {
  const config = options?.config || {};
  
  // Check if this is JSON content
  const isJson = isJsonContent(leftText) && isJsonContent(rightText);
  
  // For JSON content, use structural diff with smart field detection
  if (isJson) {
    return computeSmartJsonDiff(leftText, rightText, config);
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
function computeSmartJsonDiff(leftText: string, rightText: string, config?: ComparisonConfig): DiffResult {
  try {
    const leftJson = JSON.parse(leftText);
    const rightJson = JSON.parse(rightText);
    
    // Format both JSONs
    const leftFormatted = JSON.stringify(leftJson, null, 2);
    const rightFormatted = JSON.stringify(rightJson, null, 2);
    
    // Preprocess to mark timestamp/ID fields
    const leftProcessed = preprocessJsonForComparison(leftFormatted);
    const rightProcessed = preprocessJsonForComparison(rightFormatted);
    
    // Use structural diff for better alignment
    return computeStructuralDiff(leftProcessed, rightProcessed, config);
  } catch {
    // Fall back to text diff if JSON parsing fails
    return computeStructuralDiff(leftText, rightText, config);
  }
}

// Preprocess JSON to normalize timestamps and IDs
function preprocessJsonForComparison(jsonText: string): string {
  const lines = jsonText.split('\n');
  return lines.map(line => {
    // Check if line contains a field that looks like timestamp or ID
    const fieldMatch = line.match(/^(\s*)"([^"]+)"\s*:\s*(.+)/);
    if (fieldMatch) {
      const [, indent, key, value] = fieldMatch;
      const fieldType = detectFieldType(key, value);
      
      if (fieldType === 'timestamp') {
        // Check if values are actually different timestamps
        const timestampPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}|\d{10,13}/;
        if (timestampPattern.test(value)) {
          // Mark timestamp fields to be treated specially
          return `${indent}"${key}": ${value} /* TIMESTAMP */`;
        }
      } else if (fieldType === 'id') {
        // Mark ID fields
        const idPattern = /"[0-9a-f-]+"|"(usr_|sess_|prod_|req_)[^"]+"/;
        if (idPattern.test(value)) {
          return `${indent}"${key}": ${value} /* ID */`;
        }
      }
    }
    return line;
  }).join('\n');
}
