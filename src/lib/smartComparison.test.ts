import { describe, it, expect } from 'vitest';
import {
  looksLikeJWT,
  looksLikeHexHash,
  CLASSIFIERS,
  getClassifier,
  detectFieldType,
} from './smartComparison';

describe('looksLikeJWT', () => {
  // Positives — real-world-shaped JWTs (handcrafted; never sign anything sensitive in tests)
  it('matches a standard 3-segment JWT', () => {
    expect(looksLikeJWT('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c')).toBe(true);
  });

  it('matches a JWT with hyphens and underscores in payload', () => {
    expect(looksLikeJWT('eyJhbGciOiJIUzI1NiJ9.dGVzdC1wYXlsb2FkX3dpdGgtZGFzaGVz.signature_with-mixed_chars12')).toBe(true);
  });

  it('matches a JWT with very long payload', () => {
    const longPayload = 'a'.repeat(500);
    expect(looksLikeJWT(`eyJhbGciOiJIUzI1NiJ9.${longPayload}.signature1234567`)).toBe(true);
  });

  it('matches a JWT with RS256-style signature', () => {
    expect(looksLikeJWT('eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.eyJpc3MiOiJodHRwczovL2V4YW1wbGUuY29tIn0.QkRfRkFLRV9TSUdOQVRVUkVfRk9SX1RFU1RJTkc')).toBe(true);
  });

  it('matches a JWT with mixed-case base64url chars', () => {
    expect(looksLikeJWT('eyJhbGciOiJFUzI1NiJ9.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789.SiGnAtUrEhErE12345')).toBe(true);
  });

  it('matches a minimal-but-valid JWT shape', () => {
    expect(looksLikeJWT('eyJhbGc12.payload01.signat01')).toBe(true);
  });

  // Negatives — things that should never look like a JWT
  it('rejects empty string', () => {
    expect(looksLikeJWT('')).toBe(false);
  });

  it('rejects too-short string', () => {
    expect(looksLikeJWT('a.b.c')).toBe(false);
  });

  it('rejects two-segment string (looks like JWT but missing signature)', () => {
    expect(looksLikeJWT('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ')).toBe(false);
  });

  it('rejects four-segment string (extra dots)', () => {
    expect(looksLikeJWT('eyJhbGciOiJIUzI1NiJ9.payload.signature.extra')).toBe(false);
  });

  it('rejects string not starting with eyJ', () => {
    expect(looksLikeJWT('header12.payload12345.signature1234')).toBe(false);
  });

  it('rejects a UUID', () => {
    expect(looksLikeJWT('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('rejects a version string', () => {
    expect(looksLikeJWT('1.2.3')).toBe(false);
  });

  it('rejects a long version string', () => {
    expect(looksLikeJWT('eyJ-but-not-base64.junk.invalid#!chars')).toBe(false);
  });

  it('rejects an email address', () => {
    expect(looksLikeJWT('user@example.com')).toBe(false);
  });

  it('rejects a SKU-like product code', () => {
    expect(looksLikeJWT('SKU-12345-XL-RED')).toBe(false);
  });

  it('rejects a pure integer string', () => {
    expect(looksLikeJWT('1234567890')).toBe(false);
  });

  it('rejects a URL', () => {
    expect(looksLikeJWT('https://example.com/api/v1/users')).toBe(false);
  });

  it('rejects a non-string input (number)', () => {
    // @ts-expect-error testing non-string input
    expect(looksLikeJWT(12345)).toBe(false);
  });

  it('rejects a non-string input (null)', () => {
    // @ts-expect-error testing non-string input
    expect(looksLikeJWT(null)).toBe(false);
  });

  it('rejects a JWT with too-short header', () => {
    expect(looksLikeJWT('eyJ.payload12345.signat12')).toBe(false);
  });

  it('rejects a JWT with too-short signature', () => {
    expect(looksLikeJWT('eyJhbGciOiJIUzI1NiJ9.payload.short')).toBe(false);
  });

  it('handles surrounding double quotes (JSON-extracted value)', () => {
    expect(
      looksLikeJWT('"eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"')
    ).toBe(true);
  });

  it('rejects bare base64 (no dots)', () => {
    expect(looksLikeJWT('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9eyJzdWIiOiIxMjM0NTY3ODkwIn0SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV')).toBe(false);
  });
});

describe('looksLikeHexHash', () => {
  // Positives — common digest lengths
  it('matches an MD5 hash (32 hex chars with letters)', () => {
    expect(looksLikeHexHash('5d41402abc4b2a76b9719d911017c592')).toBe(true);
  });

  it('matches a SHA-1 hash (40 hex chars)', () => {
    expect(looksLikeHexHash('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d')).toBe(true);
  });

  it('matches a SHA-224 hash (56 hex chars)', () => {
    expect(looksLikeHexHash('730e109bd7a8a32b1cb9d9a09aa2325d2430587ddbc0c38bad911525')).toBe(true);
  });

  it('matches a SHA-256 hash (64 hex chars)', () => {
    expect(looksLikeHexHash('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')).toBe(true);
  });

  it('matches a SHA-384 hash (96 hex chars)', () => {
    expect(
      looksLikeHexHash('ca737f1014a48f4c0b6dd43cb177b0afd9e5169367544c494011e3317dbf9a509cb1e5dc1e85a941bbee3d7f2afbc9b1')
    ).toBe(true);
  });

  it('matches a SHA-512 hash (128 hex chars)', () => {
    expect(
      looksLikeHexHash(
        '861844d6704e8573fec34d967e20bcfef3d424cf48be04e6dc08f2bd58c729743371015ead891cc3cf1c9d34b49264b510751b1ff9e537937bc46b5d6ff4ecc8'
      )
    ).toBe(true);
  });

  it('matches uppercase hex', () => {
    expect(looksLikeHexHash('5D41402ABC4B2A76B9719D911017C592')).toBe(true);
  });

  it('matches mixed-case hex', () => {
    expect(looksLikeHexHash('aBcDeF1234567890aBcDeF1234567890')).toBe(true);
  });

  it('handles surrounding double quotes (JSON-extracted)', () => {
    expect(looksLikeHexHash('"aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"')).toBe(true);
  });

  // Negatives — guard against false positives
  it('rejects empty string', () => {
    expect(looksLikeHexHash('')).toBe(false);
  });

  it('rejects pure-numeric 32-char string (no a-f)', () => {
    // 32 digits, all numeric — could be a long ID, not a hash
    expect(looksLikeHexHash('12345678901234567890123456789012')).toBe(false);
  });

  it('rejects pure-numeric 64-char string (no a-f)', () => {
    expect(looksLikeHexHash('1234567890123456789012345678901234567890123456789012345678901234')).toBe(false);
  });

  it('rejects a 24-char hex string (Mongo ObjectId — not a hash length)', () => {
    expect(looksLikeHexHash('507f1f77bcf86cd799439011')).toBe(false);
  });

  it('rejects a UUID (with dashes, not hex-only)', () => {
    expect(looksLikeHexHash('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('rejects a hex string of unusual length (33 chars)', () => {
    expect(looksLikeHexHash('5d41402abc4b2a76b9719d911017c5923')).toBe(false);
  });

  it('rejects a hex string of unusual length (39 chars)', () => {
    expect(looksLikeHexHash('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434')).toBe(false);
  });

  it('rejects a string with non-hex chars', () => {
    expect(looksLikeHexHash('5d41402abc4b2a76b9719d911017c59z')).toBe(false);
  });

  it('rejects a version string', () => {
    expect(looksLikeHexHash('1.2.3')).toBe(false);
  });

  it('rejects a product SKU', () => {
    expect(looksLikeHexHash('SKU-12345-XL-RED')).toBe(false);
  });

  it('rejects an email address', () => {
    expect(looksLikeHexHash('user@example.com')).toBe(false);
  });

  it('rejects a JWT', () => {
    expect(
      looksLikeHexHash(
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
      )
    ).toBe(false);
  });

  it('rejects a URL', () => {
    expect(looksLikeHexHash('https://example.com/api/users')).toBe(false);
  });

  it('rejects non-string input (number)', () => {
    // @ts-expect-error testing non-string input
    expect(looksLikeHexHash(123)).toBe(false);
  });

  it('rejects non-string input (null)', () => {
    // @ts-expect-error testing non-string input
    expect(looksLikeHexHash(null)).toBe(false);
  });

  it('rejects non-string input (object)', () => {
    // @ts-expect-error testing non-string input
    expect(looksLikeHexHash({ hash: 'abc' })).toBe(false);
  });

  it('rejects a hex string with spaces', () => {
    expect(looksLikeHexHash('5d41 402a bc4b 2a76 b971 9d91 1017 c592')).toBe(false);
  });

  it('rejects pure-decimal but right-length-ish strings repeatedly', () => {
    // 40 digits — same length as SHA-1 but no hex letters
    expect(looksLikeHexHash('1234567890123456789012345678901234567890')).toBe(false);
  });

  it('rejects a base64-style string (has + / =)', () => {
    expect(looksLikeHexHash('AbCdEf+/Gh==12345678901234567890123456')).toBe(false);
  });
});

describe('CLASSIFIERS registry', () => {
  it('exports all 10 classifiers', () => {
    const expected = [
      'uuid',
      'mongo-object-id',
      'iso8601',
      'epoch-millis',
      'jwt',
      'hex-hash',
      'trace-id',
      'session-id',
      'request-id',
      'semver',
    ];
    expect(CLASSIFIERS.map((c) => c.name)).toEqual(expected);
  });

  it('UUID classifier matches UUID v4', () => {
    const c = getClassifier('uuid');
    expect(c?.match('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(c?.match('not-a-uuid')).toBe(false);
  });

  it('mongo-object-id classifier matches 24-char hex', () => {
    const c = getClassifier('mongo-object-id');
    expect(c?.match('507f1f77bcf86cd799439011')).toBe(true);
    expect(c?.match('507f1f77bcf86cd79943901')).toBe(false); // 23 chars
  });

  it('iso8601 classifier matches valid ISO timestamps', () => {
    const c = getClassifier('iso8601');
    expect(c?.match('2026-04-18T15:30:45Z')).toBe(true);
    expect(c?.match('2026-04-18T15:30:45.123Z')).toBe(true);
    expect(c?.match('2026-04-18T15:30:45+05:30')).toBe(true);
    expect(c?.match('2026-04-18')).toBe(false); // date only
  });

  it('epoch-millis classifier matches 10-13 digit numbers', () => {
    const c = getClassifier('epoch-millis');
    expect(c?.match('1776530000')).toBe(true);
    expect(c?.match('1776530000123')).toBe(true);
    expect(c?.match('123')).toBe(false);
    expect(c?.match('12345678901234')).toBe(false); // 14 digits
  });

  it('semver classifier matches semantic versions', () => {
    const c = getClassifier('semver');
    expect(c?.match('1.2.3')).toBe(true);
    expect(c?.match('v1.2.3')).toBe(true);
    expect(c?.match('^1.2.3')).toBe(true);
    expect(c?.match('1.2.3-alpha.1')).toBe(true);
    expect(c?.match('1.2')).toBe(false);
  });

  it('trace-id classifier matches trace_/tr_/otel_ prefixes', () => {
    const c = getClassifier('trace-id');
    expect(c?.match('trace_abc123def')).toBe(true);
    expect(c?.match('tr-abc123def')).toBe(true);
    expect(c?.match('otel_abcdef1234')).toBe(true);
    expect(c?.match('trace_abc')).toBe(false); // too short
  });

  it('session-id classifier matches sess_/session_ prefixes', () => {
    const c = getClassifier('session-id');
    expect(c?.match('sess_abc123')).toBe(true);
    expect(c?.match('session_abc123')).toBe(true);
    expect(c?.match('sess_abc')).toBe(false);
  });

  it('request-id classifier matches req_ prefix', () => {
    const c = getClassifier('request-id');
    expect(c?.match('req_abc123')).toBe(true);
    expect(c?.match('req_abc')).toBe(false);
  });

  it('returns undefined for unknown classifier name', () => {
    expect(getClassifier('does-not-exist')).toBeUndefined();
  });

  it('all classifiers reject non-string inputs without throwing', () => {
    for (const c of CLASSIFIERS) {
      // @ts-expect-error testing runtime safety
      expect(() => c.match(null)).not.toThrow();
      // @ts-expect-error testing runtime safety
      expect(() => c.match(undefined)).not.toThrow();
      // @ts-expect-error testing runtime safety
      expect(() => c.match(12345)).not.toThrow();
      // @ts-expect-error testing runtime safety
      expect(() => c.match({ key: 'value' })).not.toThrow();
    }
  });
});

describe('detectFieldType (regression)', () => {
  it('still classifies timestamp by key name', () => {
    expect(detectFieldType('created_at', '2026-04-18T15:30:45Z')).toBe('timestamp');
  });

  it('still classifies UUID by value pattern', () => {
    expect(detectFieldType('orderId', '550e8400-e29b-41d4-a716-446655440000')).toBe('id');
  });

  it('still classifies version by key name', () => {
    expect(detectFieldType('version', '1.2.3')).toBe('version');
  });

  it('returns normal for non-matching field', () => {
    expect(detectFieldType('product_name', 'Widget')).toBe('normal');
  });
});
