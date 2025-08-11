// Redis-based rate limiter placeholder (extensible). Fallback to in-memory.
import { env } from '@/lib/env';

interface Bucket { count: number; windowStart: number }
const memoryStore = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const DEFAULT_LIMITS: Record<string, number> = {
  generate: 5,
  ops: 15,
  preview: 30,
  default: 10,
};

export const __RATE_LIMIT_WINDOW_MS = WINDOW_MS; // test visibility
export const __RATE_LIMIT_MAX = DEFAULT_LIMITS.default; // test visibility
export function __resetRateLimiter() { memoryStore.clear(); } // test helper

let redisClient: any = null;
async function getRedis(){
  if (redisClient || !env.REDIS_URL) return redisClient;
  try {
    const { createClient } = await import('redis');
    redisClient = createClient({ url: env.REDIS_URL });
    redisClient.on('error', () => {});
    if (!redisClient.isOpen) await redisClient.connect();
  } catch { redisClient = null; }
  return redisClient;
}

export async function checkRate(key: string, bucket: string = 'default') {
  const limit = DEFAULT_LIMITS[bucket] ?? DEFAULT_LIMITS.default;
  const mapKey = bucket + ':' + key;
  const now = Date.now();
  const client = await getRedis();
  if (client) {
    const ttlKey = 'rl:ttl:'+mapKey;
    const countKey = 'rl:count:'+mapKey;
    const ttl = await client.get(ttlKey);
    if (!ttl) {
      // start new window
      await client.multi()
        .set(ttlKey, String(now), { PX: WINDOW_MS })
        .set(countKey, '1', { PX: WINDOW_MS })
        .exec();
      return { allowed: true, remaining: limit - 1 };
    }
    const countStr = await client.get(countKey);
    let count = parseInt(countStr||'0',10);
    if (isNaN(count) || count<0) count = 0;
    if (count >= limit) return { allowed:false, remaining:0 };
    count += 1;
    await client.set(countKey, String(count));
    return { allowed:true, remaining: limit - count };
  }
  // fallback memory
  const b = memoryStore.get(mapKey);
  if (!b || now - b.windowStart > WINDOW_MS) {
    memoryStore.set(mapKey, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1 };
  }
  if (b.count >= limit) return { allowed: false, remaining: 0 };
  b.count++;
  return { allowed: true, remaining: limit - b.count };
}
