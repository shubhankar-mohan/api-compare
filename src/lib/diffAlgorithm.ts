export type DiffLineType = 'added' | 'removed' | 'unchanged' | 'empty';

export interface DiffLine {
  content: string;
  type: DiffLineType;
  lineNumber: number | null;
}

export interface DiffResult {
  left: DiffLine[];
  right: DiffLine[];
  additions: number;
  removals: number;
  hasDifferences: boolean;
}

// Longest Common Subsequence algorithm for optimal diff
function lcs(a: string[], b: string[]): number[][] {
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

  // Backtrack through LCS to build diff
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
      // Lines match
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
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
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

  const additions = right.filter(l => l.type === 'added').length;
  const removals = left.filter(l => l.type === 'removed').length;

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
