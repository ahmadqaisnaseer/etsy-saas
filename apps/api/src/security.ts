import { createHash, randomBytes } from 'node:crypto';
import { Algorithm, hash, verify } from '@node-rs/argon2';

const options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
};

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
export const hashPassword = (password: string, pepper: string): Promise<string> =>
  hash(`${password}\u0000${pepper}`, options);
export const verifyPassword = (
  encoded: string,
  password: string,
  pepper: string,
): Promise<boolean> => verify(encoded, `${password}\u0000${pepper}`, options);

export const createSessionToken = (): string => randomBytes(32).toString('base64url');
export const hashSessionToken = (token: string): Buffer =>
  createHash('sha256').update(token).digest();

export const slugify = (value: string): string => {
  const base = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${base || 'workspace'}-${randomBytes(3).toString('hex')}`;
};
