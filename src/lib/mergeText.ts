/**
 * Repair the commas of a line-level JSON merge.
 *
 * MergeView splices rendered lines, and each line carries its own trailing
 * comma, so accepting a removed last member leaves `"a": 1,\n}` and accepting
 * an added last member produces `"b": 2\n"c": 3`. Both are invalid JSON. When
 * the merged text is JSON-shaped and does not parse, this re-derives every
 * member's comma from its position: a line gets a trailing comma iff the next
 * non-blank line is not a closer, and never if it opens a container.
 *
 * Strings are respected by only ever looking at the end of a line, and a
 * string value cannot span lines in JSON.
 */
export function finalizeMergedJson(text: string): { text: string; valid: boolean } {
  if (parses(text)) return { text, valid: true };
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return { text, valid: false };

  const lines = text.split('\n');
  const out = lines.map((line, i) => {
    const body = line.replace(/\s+$/, '');
    if (body.trim() === '') return line;
    const bare = body.replace(/,\s*$/, '');
    const opensContainer = /[{[]\s*$/.test(bare);
    let next = i + 1;
    while (next < lines.length && lines[next].trim() === '') next++;
    const nextIsCloser = next >= lines.length || /^\s*[}\]]/.test(lines[next]);
    if (opensContainer || nextIsCloser) return bare;
    return `${bare},`;
  });
  const repaired = out.join('\n');
  return parses(repaired) ? { text: repaired, valid: true } : { text, valid: false };
}

function parses(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}
