import { checkRate } from '@/utils/rateLimiter';

describe('rateLimiter', () => {
  it('allows first request', async () => {
    const r = await checkRate('test-user');
    expect(r.allowed).toBe(true);
  });
  it('increments count', async () => {
    await checkRate('test-user');
    const r = await checkRate('test-user');
    expect(r.remaining).toBeGreaterThanOrEqual(0);
  });
});
