import { Fragment } from 'react';
import { cn } from '@/lib/utils';

interface JsonSyntaxHighlightProps {
  content: string;
  className?: string;
}

// Priority order: strings first so numbers/booleans inside a string are not
// matched on their own.
const PATTERNS: { regex: RegExp; cls: string }[] = [
  { regex: /"([^"\\]|\\.)*"/g, cls: 'text-[hsl(var(--syntax-string))]' },
  { regex: /\b-?\d+\.?\d*([eE][+-]?\d+)?\b/g, cls: 'text-[hsl(var(--syntax-number))]' },
  { regex: /\b(true|false)\b/g, cls: 'text-[hsl(var(--syntax-boolean))]' },
  { regex: /\bnull\b/g, cls: 'text-[hsl(var(--syntax-null))]' },
  { regex: /[{}[\]]/g, cls: 'text-[hsl(var(--syntax-bracket))]' },
  { regex: /[,:]/g, cls: 'text-[hsl(var(--syntax-punctuation))]' },
];

export interface SyntaxSegment {
  text: string;
  /** Tailwind class for a recognised token; undefined for plain text between tokens. */
  cls?: string;
}

/**
 * Split one rendered line into coloured tokens and the plain text between them.
 *
 * This returns data, and the component below renders it as React elements.
 * The previous version built an HTML string — escaping only the tokens it had
 * matched and splicing them into the *unescaped* line — and handed it to
 * `dangerouslySetInnerHTML`. Any non-JSON response (a gateway's HTML 502 page,
 * identical on both sides and therefore rendered as an "unchanged" row) was
 * injected into the page as live markup. Response text is data; it is never
 * interpreted as HTML here.
 */
export function tokenizeJsonLine(text: string): SyntaxSegment[] {
  const claimed = new Uint8Array(text.length);
  const tokens: { start: number; end: number; cls: string }[] = [];

  for (const { regex, cls } of PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (end === start) {
        regex.lastIndex++;
        continue;
      }
      let overlaps = false;
      for (let i = start; i < end; i++) {
        if (claimed[i]) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      for (let i = start; i < end; i++) claimed[i] = 1;
      tokens.push({ start, end, cls });
    }
  }

  tokens.sort((a, b) => a.start - b.start);

  const out: SyntaxSegment[] = [];
  let cursor = 0;
  for (const t of tokens) {
    if (t.start > cursor) out.push({ text: text.slice(cursor, t.start) });
    out.push({ text: text.slice(t.start, t.end), cls: t.cls });
    cursor = t.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
}

export function JsonSyntaxHighlight({ content, className }: JsonSyntaxHighlightProps) {
  const segments = tokenizeJsonLine(content);
  return (
    <span className={cn('font-mono', className)}>
      {segments.map((s, i) =>
        s.cls ? (
          <span key={i} className={s.cls}>
            {s.text}
          </span>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        )
      )}
    </span>
  );
}
