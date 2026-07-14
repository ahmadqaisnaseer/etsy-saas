import { describe, expect, it } from 'vitest';
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  normalizeEmail,
  verifyPassword,
} from './security.js';

describe('security primitives', () => {
  it('normalizes identity emails', () =>
    expect(normalizeEmail('  Owner@Example.COM ')).toBe('owner@example.com'));

  it('hashes and verifies passwords without retaining plaintext', async () => {
    const encoded = await hashPassword(
      'correct horse battery staple',
      'a-secure-test-pepper-that-is-long-enough',
    );
    expect(encoded).not.toContain('correct horse');
    await expect(
      verifyPassword(
        encoded,
        'correct horse battery staple',
        'a-secure-test-pepper-that-is-long-enough',
      ),
    ).resolves.toBe(true);
    await expect(
      verifyPassword(encoded, 'wrong password', 'a-secure-test-pepper-that-is-long-enough'),
    ).resolves.toBe(false);
  });

  it('creates opaque tokens and deterministic storage hashes', () => {
    const token = createSessionToken();
    expect(token.length).toBeGreaterThan(40);
    expect(hashSessionToken(token)).toEqual(hashSessionToken(token));
    expect(hashSessionToken(token).toString('hex')).not.toContain(token);
  });
});
