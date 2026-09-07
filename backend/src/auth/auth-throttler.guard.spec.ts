import { AuthThrottlerGuard } from './auth-throttler.guard';

describe('AuthThrottlerGuard', () => {
  const guard = Object.create(
    AuthThrottlerGuard.prototype,
  ) as AuthThrottlerGuard;
  // getTracker is a protected method - access it via a cast for the test.
  const getTracker = (guard as unknown as {
    getTracker: (req: Record<string, unknown>) => Promise<string>;
  }).getTracker.bind(guard);

  it('combines the real client IP with the normalized email from the request body', async () => {
    const tracker = await getTracker({
      ip: '203.0.113.5',
      body: { email: '  Jane.Doe@Example.COM  ' },
    });
    expect(tracker).toBe('203.0.113.5:jane.doe@example.com');
  });

  it('prefers req.ips[0] (the real client, once trust proxy is set) over req.ip', async () => {
    const tracker = await getTracker({
      ip: '10.0.0.5', // the innermost proxy's address
      ips: ['203.0.113.9', '10.0.0.5'],
      body: { email: 'user@example.com' },
    });
    expect(tracker).toBe('203.0.113.9:user@example.com');
  });

  it('falls back to IP alone when the body has no email (e.g. forgot-password with a bad payload)', async () => {
    const tracker = await getTracker({ ip: '203.0.113.5', body: {} });
    expect(tracker).toBe('203.0.113.5');
  });

  it('never throws on a missing body', async () => {
    const tracker = await getTracker({ ip: '203.0.113.5' });
    expect(tracker).toBe('203.0.113.5');
  });
});
