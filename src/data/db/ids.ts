import * as Crypto from 'expo-crypto';

export const DEMO_USER_ID = 'user_demo_local';

export function createId(prefix: string): string {
  return `${prefix}_${Crypto.randomUUID()}`;
}
