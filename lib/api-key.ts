import { nanoid } from 'nanoid';
import crypto from 'crypto';

export function generateApiKey(): string {
  // Generate a secure API key
  return `aw_${nanoid(32)}`;
}

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

export function verifyApiKey(apiKey: string, hash: string): boolean {
  return hashApiKey(apiKey) === hash;
}
