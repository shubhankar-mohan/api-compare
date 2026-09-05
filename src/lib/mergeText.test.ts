import { describe, it, expect } from 'vitest';
import { finalizeMergedJson } from './mergeText';

describe('finalizeMergedJson', () => {
  it('adds the comma a line-level merge dropped between members', () => {
    const r = finalizeMergedJson('{\n  "a": 1,\n  "b": 2\n  "c": 3\n}');
    expect(r.valid).toBe(true);
    expect(JSON.parse(r.text)).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('removes a trailing comma left before a closer', () => {
    const r = finalizeMergedJson('{\n  "a": 1,\n}');
    expect(r.valid).toBe(true);
    expect(JSON.parse(r.text)).toEqual({ a: 1 });
  });

  it('handles nested containers and arrays', () => {
    const r = finalizeMergedJson('{\n  "items": [\n    1,\n    2\n    3\n  ],\n  "o": {\n    "x": true,\n  }\n}');
    expect(r.valid).toBe(true);
    expect(JSON.parse(r.text)).toEqual({ items: [1, 2, 3], o: { x: true } });
  });

  it('leaves already-valid JSON untouched', () => {
    const text = '{\n  "a": 1\n}';
    expect(finalizeMergedJson(text)).toEqual({ text, valid: true });
  });

  it('leaves non-JSON text untouched and reports it', () => {
    const text = 'apiVersion: v1\nkind: Deployment';
    expect(finalizeMergedJson(text)).toEqual({ text, valid: false });
  });

  it('does not add commas inside a multi-line string value', () => {
    const text = '{\n  "s": "line one\\nline two",\n  "b": 2\n}';
    expect(finalizeMergedJson(text)).toEqual({ text, valid: true });
  });
});
