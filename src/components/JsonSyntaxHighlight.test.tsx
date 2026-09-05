import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { JsonSyntaxHighlight } from './JsonSyntaxHighlight';

describe('JsonSyntaxHighlight', () => {
  it('never turns response text into live markup', () => {
    // A gateway's HTML error page, identical on both sides, is rendered as an
    // "unchanged" row through this component.
    const hostile = '<img src=x onerror="alert(1)"> Error 502 <script>bad()</script>';
    const { container } = render(<JsonSyntaxHighlight content={hostile} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toBe(hostile);
  });

  it('renders the text verbatim, including entities and quotes', () => {
    const text = '  "msg": "a &amp; b <c> \\"q\\"",';
    const { container } = render(<JsonSyntaxHighlight content={text} />);
    expect(container.textContent).toBe(text);
  });

  it('still colours JSON tokens', () => {
    const { container } = render(<JsonSyntaxHighlight content={'  "count": 42,'} />);
    const spans = Array.from(container.querySelectorAll('span span'));
    expect(spans.map((s) => s.textContent)).toEqual(['"count"', ':', '42', ',']);
    expect(spans[0].className).toContain('syntax-string');
    expect(spans[2].className).toContain('syntax-number');
  });
});
