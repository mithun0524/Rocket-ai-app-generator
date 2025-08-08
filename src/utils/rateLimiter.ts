// Redis-based rate limiter placeholder (extensible). Fallback to in-memory.
import { env } from '@/lib/env';

interface Bucket { count: number; windowStart: number }
const memoryStore = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const LIMIT = 10; // increased global limit for future multi-feature use

export const __RATE_LIMIT_WINDOW_MS = WINDOW_MS; // test visibility
export const __RATE_LIMIT_MAX = LIMIT; // test visibility
export function __resetRateLimiter() { memoryStore.clear(); } // test helper

export async function checkRate(key: string) {
  const now = Date.now();
  const bucket = memoryStore.get(key);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    memoryStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: LIMIT - 1 };
  }
  if (bucket.count >= LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  bucket.count++;
  return { allowed: true, remaining: LIMIT - bucket.count };
}
