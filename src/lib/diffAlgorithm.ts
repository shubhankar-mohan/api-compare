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

// Calculate similarity between two strings (0-1)
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
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
  // For better granularity, use character-level diff for lines with high similarity
  const similarity = calculateSimilarity(leftLine, rightLine);
  
  // If lines are very similar, use character-level diff for more precise highlighting
  if (similarity > 0.5) {
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

export function computeDiff(leftText: string, rightText: string): DiffResult {
  const leftLines = leftText.split('\n');
  const rightLines = rightText.split('\n');

  const dp = lcs(leftLines, rightLines);
  
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
    if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
      // Lines match exactly
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
      const similarity = calculateSimilarity(leftLines[i - 1], rightLines[j - 1]);
      
      // If lines are at least 30% similar, or if we're at a point where both need to be consumed,
      // pair them for inline diff
      if (similarity > 0.3 || dp[i - 1][j] === dp[i][j - 1]) {
        const { leftSegments, rightSegments } = computeWordDiff(leftLines[i - 1], rightLines[j - 1]);
        
        // Only mark as modified if there are actual differences in segments
        const hasChanges = leftSegments.some(s => s.type !== 'unchanged') || 
                          rightSegments.some(s => s.type !== 'unchanged');
        
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

export function formatHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}
