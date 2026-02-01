import { ComparisonConfig } from './diffAlgorithm';

/**
 * Enhanced diff algorithm that handles structural differences in config files
 * This addresses the issue where missing fields (like hostname) cause all subsequent lines
 * to be marked as different even when they're identical
 */

interface StructuralLine {
  content: string;
  normalized: string;
  indent: number;
  key?: string;      // For key-value pairs like "hostname: nginx"
  value?: string;
  isComment?: boolean;
  isEmpty?: boolean;
}

/**
 * Parse a line into structural components
 */
function parseStructuralLine(line: string, config?: ComparisonConfig): StructuralLine {
  const normalized = normalizeLine(line, config);
  
  // Calculate indentation level
  const indentMatch = line.match(/^(\s*)/);
  const indent = indentMatch ? Math.floor(indentMatch[1].length / 2) : 0;
  
  // Check if it's a comment
  const isComment = /^\s*[#\/\/]/.test(line);
  
  // Check if it's empty
  const isEmpty = line.trim() === '';
  
  // Parse key-value pairs (YAML style and environment variables)
  let key: string | undefined;
  let value: string | undefined;
  
  // Check for YAML key-value pairs
  const keyValueMatch = normalized.match(/^(\s*)([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
  if (keyValueMatch) {
    key = keyValueMatch[2];
    value = keyValueMatch[3];
  }
  
  // Also check for environment variable format (- KEY=value or - KEY: value)
  const envVarMatch = normalized.match(/^(\s*)-\s*([A-Z_][A-Z0-9_]*)[=:]\s*(.*)$/);
  if (envVarMatch) {
    key = envVarMatch[2];
    value = envVarMatch[3];
  }
  
  return {
    content: line,
    normalized,
    indent,
    key,
    value,
    isComment,
    isEmpty
  };
}

/**
 * Normalize a line for comparison
 */
function normalizeLine(line: string, config?: ComparisonConfig): string {
  let normalized = line;
  
  // Special handling for timestamp and ID markers
  const hasTimestampMarker = line.includes('/* TIMESTAMP */');
  const hasIdMarker = line.includes('/* ID */');
  
  if (hasTimestampMarker || hasIdMarker) {
    // Extract the field name and type, ignore the value for comparison
    const match = line.match(/^(\s*"[^"]+"\s*:).*(\/\* (TIMESTAMP|ID) \*\/)/);
    if (match) {
      // Normalize to just the field name and type for comparison
      normalized = match[1] + ' <NORMALIZED_' + match[3] + '>';
      return normalized;
    }
  }
  
  // Remove all invisible characters and normalize whitespace
  normalized = normalized
    .replace(/[\u0000-\u001F]/g, '')
    .replace(/[\u007F-\u009F]/g, '')
    .replace(/\u200B/g, '')
    .replace(/\u200C/g, '')
    .replace(/\u200D/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2000-\u200A]/g, ' ')
    .replace(/\u202F/g, ' ')
    .replace(/\u3000/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n/g, '')
    .replace(/\t/g, '  ');
  
  // Normalize indentation
  const match = normalized.match(/^(\s*)(.*)/);
  if (match) {
    const [, indent, content] = match;
    const normalizedIndent = indent
      .replace(/    /g, '  ')
      .replace(/   /g, '  ')
      .replace(/     /g, '  ');
    normalized = normalizedIndent + content;
  }
  
  return normalized.trimEnd();
}

/**
 * Find matching lines based on structure, not just position
 */
export function findStructuralMatches(
  leftLines: string[],
  rightLines: string[],
  config?: ComparisonConfig
): Map<number, number> {
  const leftStructured = leftLines.map(line => parseStructuralLine(line, config));
  const rightStructured = rightLines.map(line => parseStructuralLine(line, config));
  
  const matches = new Map<number, number>();
  const usedRight = new Set<number>();
  
  // First pass: exact normalized matches at same position
  for (let i = 0; i < leftStructured.length; i++) {
    if (i < rightStructured.length && !usedRight.has(i)) {
      if (leftStructured[i].normalized === rightStructured[i].normalized) {
        matches.set(i, i);
        usedRight.add(i);
      }
    }
  }
  
  // Second pass: find exact normalized matches at different positions
  // but with same indent level (handles missing fields)
  for (let i = 0; i < leftStructured.length; i++) {
    if (matches.has(i)) continue;
    
    const leftLine = leftStructured[i];
    
    // Look for matching line within a wider window (to handle missing fields)
    const searchStart = Math.max(0, i - 30);
    const searchEnd = Math.min(rightStructured.length, i + 30);
    
    for (let j = searchStart; j < searchEnd; j++) {
      if (usedRight.has(j)) continue;
      
      const rightLine = rightStructured[j];
      
      // Check if normalized content matches (allow slight indent differences for YAML)
      if (leftLine.normalized === rightLine.normalized) {
        // Prioritize exact indent matches, but accept close indents
        const indentDiff = Math.abs(leftLine.indent - rightLine.indent);
        if (indentDiff <= 2) { // Allow up to 2 levels of indent difference
          matches.set(i, j);
          usedRight.add(j);
          break;
        }
      }
      
      // Also check if both lines are timestamps or IDs for the same field
      const leftIsSpecial = leftLine.normalized.includes('<NORMALIZED_TIMESTAMP>') || leftLine.normalized.includes('<NORMALIZED_ID>');
      const rightIsSpecial = rightLine.normalized.includes('<NORMALIZED_TIMESTAMP>') || rightLine.normalized.includes('<NORMALIZED_ID>');
      
      if (leftIsSpecial && rightIsSpecial) {
        // Extract field names
        const leftField = leftLine.normalized.match(/^(\s*"[^"]+"\s*:)/);
        const rightField = rightLine.normalized.match(/^(\s*"[^"]+"\s*:)/);
        
        if (leftField && rightField && leftField[1] === rightField[1]) {
          // Same field, both are timestamps/IDs - treat as unchanged
          matches.set(i, j);
          usedRight.add(j);
          break;
        }
      }
    }
  }
  
  // Third pass: match key-value pairs even if at different positions
  for (let i = 0; i < leftStructured.length; i++) {
    if (matches.has(i)) continue;
    
    const leftLine = leftStructured[i];
    if (!leftLine.key) continue;
    
    // Find matching key in right side
    for (let j = 0; j < rightStructured.length; j++) {
      if (usedRight.has(j)) continue;
      
      const rightLine = rightStructured[j];
      
      if (leftLine.key === rightLine.key &&
          leftLine.value === rightLine.value &&
          Math.abs(leftLine.indent - rightLine.indent) <= 1) {
        matches.set(i, j);
        usedRight.add(j);
        break;
      }
    }
  }
  
  return matches;
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses Levenshtein distance normalized by the longer string length
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;
  
  // Check for common prefixes/suffixes as these indicate similarity
  const commonPrefixLen = getCommonPrefixLength(str1, str2);
  const commonSuffixLen = getCommonSuffixLength(str1, str2);
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1;
  
  // If they share a significant prefix, boost similarity
  const prefixBoost = commonPrefixLen > 10 ? 0.2 : 0;
  
  const editDistance = levenshteinDistance(str1, str2);
  const baseSimilarity = 1 - (editDistance / Math.max(str1.length, str2.length));
  
  return Math.min(1, baseSimilarity + prefixBoost);
}

function getCommonPrefixLength(str1: string, str2: string): number {
  let i = 0;
  while (i < str1.length && i < str2.length && str1[i] === str2[i]) {
    i++;
  }
  return i;
}

function getCommonSuffixLength(str1: string, str2: string): number {
  let i = 0;
  while (i < str1.length && i < str2.length && 
         str1[str1.length - 1 - i] === str2[str2.length - 1 - i]) {
    i++;
  }
  return i;
}

/**
 * Levenshtein distance for string similarity
 */
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

/**
 * Compute word-level diff between two strings
 */
function computeWordDiff(leftLine: string, rightLine: string) {
  const leftWords = leftLine.split(/\s+/);
  const rightWords = rightLine.split(/\s+/);
  
  const leftSegments: any[] = [];
  const rightSegments: any[] = [];
  
  let leftIdx = 0;
  let rightIdx = 0;
  
  while (leftIdx < leftWords.length || rightIdx < rightWords.length) {
    if (leftIdx < leftWords.length && rightIdx < rightWords.length) {
      if (leftWords[leftIdx] === rightWords[rightIdx]) {
        leftSegments.push({ text: leftWords[leftIdx] + ' ', type: 'unchanged' });
        rightSegments.push({ text: rightWords[rightIdx] + ' ', type: 'unchanged' });
        leftIdx++;
        rightIdx++;
      } else {
        // Find next match
        let foundMatch = false;
        
        // Check if next words match
        for (let i = 1; i <= 3; i++) {
          if (leftIdx + i < leftWords.length && rightIdx + i < rightWords.length &&
              leftWords[leftIdx + i] === rightWords[rightIdx + i]) {
            // Add unmatched words
            for (let j = 0; j < i; j++) {
              if (leftIdx + j < leftWords.length) {
                leftSegments.push({ text: leftWords[leftIdx + j] + ' ', type: 'removed' });
              }
              if (rightIdx + j < rightWords.length) {
                rightSegments.push({ text: rightWords[rightIdx + j] + ' ', type: 'added' });
              }
            }
            leftIdx += i;
            rightIdx += i;
            foundMatch = true;
            break;
          }
        }
        
        if (!foundMatch) {
          if (leftIdx < leftWords.length) {
            leftSegments.push({ text: leftWords[leftIdx] + ' ', type: 'removed' });
            leftIdx++;
          }
          if (rightIdx < rightWords.length) {
            rightSegments.push({ text: rightWords[rightIdx] + ' ', type: 'added' });
            rightIdx++;
          }
        }
      }
    } else if (leftIdx < leftWords.length) {
      leftSegments.push({ text: leftWords[leftIdx] + ' ', type: 'removed' });
      leftIdx++;
    } else {
      rightSegments.push({ text: rightWords[rightIdx] + ' ', type: 'added' });
      rightIdx++;
    }
  }
  
  return { leftSegments, rightSegments };
}

/**
 * Enhanced diff that understands structural differences
 */
export function computeStructuralDiff(
  leftText: string,
  rightText: string,
  config?: ComparisonConfig
) {
  const leftLines = leftText.split('\n');
  const rightLines = rightText.split('\n');
  
  // Find structural matches
  const matches = findStructuralMatches(leftLines, rightLines, config);
  
  // Build diff result based on matches
  const result = {
    left: [] as any[],
    right: [] as any[],
    additions: 0,
    removals: 0,
    hasDifferences: false
  };
  
  const rightUsed = new Set<number>();
  const modifiedPairs = new Map<number, number>(); // Track similar but not identical lines
  
  // First, find similar lines that should be marked as modified
  for (let i = 0; i < leftLines.length; i++) {
    if (matches.has(i)) continue; // Already matched exactly
    
    const leftNorm = normalizeLine(leftLines[i], config);
    
    // Look for similar lines in the right side
    for (let j = 0; j < rightLines.length; j++) {
      if (rightUsed.has(j) || Array.from(matches.values()).includes(j)) continue;
      
      const rightNorm = normalizeLine(rightLines[j], config);
      const similarity = calculateSimilarity(leftNorm, rightNorm);
      
      // Special handling for comments - if both are comments at similar positions
      const bothComments = leftNorm.startsWith('#') && rightNorm.startsWith('#');
      const positionClose = Math.abs(i - j) <= 3;
      
      // Lower threshold for comments or if lines share significant structure
      const threshold = (bothComments && positionClose) ? 0.3 : 0.4;
      
      // If lines are similar and at similar positions, mark as modified
      if (similarity > threshold && Math.abs(i - j) <= 5) {
        modifiedPairs.set(i, j);
        rightUsed.add(j);
        break;
      }
    }
  }
  
  // Process left side
  for (let i = 0; i < leftLines.length; i++) {
    if (matches.has(i)) {
      const rightIdx = matches.get(i)!;
      rightUsed.add(rightIdx);
      
      // Matched line
      result.left.push({
        content: leftLines[i],
        type: 'unchanged',
        lineNumber: i + 1
      });
    } else if (modifiedPairs.has(i)) {
      // Modified line - compute word diff
      const rightIdx = modifiedPairs.get(i)!;
      const { leftSegments, rightSegments } = computeWordDiff(leftLines[i], rightLines[rightIdx]);
      
      result.left.push({
        content: leftLines[i],
        type: 'modified',
        lineNumber: i + 1,
        segments: leftSegments
      });
      result.removals++; // Count as removal for stats
      result.hasDifferences = true;
    } else {
      // Removed line
      result.left.push({
        content: leftLines[i],
        type: 'removed',
        lineNumber: i + 1
      });
      result.removals++;
      result.hasDifferences = true;
    }
  }
  
  // Process right side
  for (let j = 0; j < rightLines.length; j++) {
    // Check if this line is part of a modified pair
    let isModified = false;
    let modifiedLeftIdx = -1;
    for (const [l, r] of modifiedPairs.entries()) {
      if (r === j) {
        isModified = true;
        modifiedLeftIdx = l;
        break;
      }
    }
    
    if (isModified && modifiedLeftIdx >= 0) {
      // Modified line - add with segments
      const { leftSegments, rightSegments } = computeWordDiff(
        leftLines[modifiedLeftIdx], 
        rightLines[j]
      );
      
      result.right[modifiedLeftIdx] = {
        content: rightLines[j],
        type: 'modified',
        lineNumber: j + 1,
        segments: rightSegments
      };
      result.additions++; // Count as addition for stats
    } else if (rightUsed.has(j)) {
      // Find which left line this matches
      let leftIdx = -1;
      for (const [l, r] of matches.entries()) {
        if (r === j) {
          leftIdx = l;
          break;
        }
      }
      
      // Matched line - position it correctly
      if (leftIdx >= 0) {
        result.right[leftIdx] = {
          content: rightLines[j],
          type: 'unchanged',
          lineNumber: j + 1
        };
      }
    } else {
      // Added line - find appropriate position
      let insertPos = j;
      
      // Try to find a good position based on surrounding context
      for (let k = j - 1; k >= 0; k--) {
        if (rightUsed.has(k)) {
          for (const [l, r] of matches.entries()) {
            if (r === k) {
              insertPos = l + 1;
              break;
            }
          }
          break;
        }
      }
      
      // Insert at appropriate position
      if (!result.right[insertPos]) {
        result.right[insertPos] = {
          content: rightLines[j],
          type: 'added',
          lineNumber: j + 1
        };
      } else {
        // Find next empty slot
        for (let p = insertPos; p < result.left.length + rightLines.length; p++) {
          if (!result.right[p]) {
            result.right[p] = {
              content: rightLines[j],
              type: 'added',
              lineNumber: j + 1
            };
            break;
          }
        }
      }
      
      result.additions++;
      result.hasDifferences = true;
    }
  }
  
  // Fill in empty slots in right side
  for (let i = 0; i < result.left.length; i++) {
    if (!result.right[i]) {
      result.right[i] = {
        content: '',
        type: 'empty',
        lineNumber: null
      };
    }
  }
  
  // Add any remaining right lines
  while (result.right.length < result.left.length) {
    result.right.push({
      content: '',
      type: 'empty',
      lineNumber: null
    });
  }
  
  return result;
}