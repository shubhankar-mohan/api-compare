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
    const claimed = new Set<number>();
    const tokens: { start: number; end: number; replacement: string }[] = [];

    // Process patterns in priority order (strings first to prevent
    // numbers/booleans inside strings from being matched separately)
    patterns.forEach(({ regex, class: className }) => {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(text)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        // Skip if any position in this range is already claimed
        let overlaps = false;
        for (let i = start; i < end; i++) {
          if (claimed.has(i)) { overlaps = true; break; }
        }
        if (!overlaps) {
          for (let i = start; i < end; i++) claimed.add(i);
          tokens.push({
            start,
            end,
            replacement: `<span class="${className}">${escapeHtml(match[0])}</span>`,
          });
        }
      }
    });

    // Sort by start position descending to replace from end to start
    tokens.sort((a, b) => b.start - a.start);

    // Apply replacements
    tokens.forEach(({ start, end, replacement }) => {
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
