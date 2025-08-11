// Ensure required env vars before modules import env.ts via rateLimiter
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:dev.db';
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'testsecretlongenough';
import { checkRate, __resetRateLimiter, __RATE_LIMIT_MAX } from '@/utils/rateLimiter';

describe('rateLimiter', () => {
  beforeEach(() => __resetRateLimiter());

  it('allows first request', async () => {
    const r = await checkRate('test-user');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(__RATE_LIMIT_MAX - 1);
  });

  it('increments count and decreases remaining', async () => {
    await checkRate('test-user'); // 1st
    const second = await checkRate('test-user'); // 2nd
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(__RATE_LIMIT_MAX - 2);
  });

  it('blocks after limit exceeded', async () => {
    for (let i = 0; i < __RATE_LIMIT_MAX; i++) {
      const r = await checkRate('exhaust');
      expect(r.allowed).toBe(true);
    }
    const finalAttempt = await checkRate('exhaust');
    expect(finalAttempt.allowed).toBe(false);
    expect(finalAttempt.remaining).toBe(0);
  });
});
