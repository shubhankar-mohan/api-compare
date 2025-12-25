import { cn } from '@/lib/utils';

interface JsonSyntaxHighlightProps {
  content: string;
  className?: string;
}

export function JsonSyntaxHighlight({ content, className }: JsonSyntaxHighlightProps) {
  const highlightJson = (text: string) => {
    // Regex patterns for different JSON elements
    const patterns = [
      // Strings (keys and values)
      { regex: /"([^"\\]|\\.)*"/g, class: 'text-[hsl(var(--syntax-string))]' },
      // Numbers
      { regex: /\b-?\d+\.?\d*([eE][+-]?\d+)?\b/g, class: 'text-[hsl(var(--syntax-number))]' },
      // Booleans
      { regex: /\b(true|false)\b/g, class: 'text-[hsl(var(--syntax-boolean))]' },
      // Null
      { regex: /\bnull\b/g, class: 'text-[hsl(var(--syntax-null))]' },
      // Brackets and braces
      { regex: /[{}[\]]/g, class: 'text-[hsl(var(--syntax-bracket))]' },
      // Colons and commas
      { regex: /[,:]/g, class: 'text-[hsl(var(--syntax-punctuation))]' },
    ];

    let result = text;
    const tokens: { start: number; end: number; replacement: string }[] = [];

    // Find all matches
    patterns.forEach(({ regex, class: className }) => {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(text)) !== null) {
        tokens.push({
          start: match.index,
          end: match.index + match[0].length,
          replacement: `<span class="${className}">${escapeHtml(match[0])}</span>`,
        });
      }
    });

    // Sort tokens by start position (descending) to replace from end to start
    tokens.sort((a, b) => b.start - a.start);

    // Check for overlapping tokens and keep only the first one
    const finalTokens: typeof tokens = [];
    tokens.forEach(token => {
      const overlaps = finalTokens.some(
        existing =>
          (token.start >= existing.start && token.start < existing.end) ||
          (token.end > existing.start && token.end <= existing.end)
      );
      if (!overlaps) {
        finalTokens.push(token);
      }
    });

    // Apply replacements
    finalTokens.forEach(({ start, end, replacement }) => {
      result = result.substring(0, start) + replacement + result.substring(end);
    });

    return result;
  };

  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  return (
    <span 
      className={cn('font-mono', className)}
      dangerouslySetInnerHTML={{ __html: highlightJson(content) }}
    />
  );
}
