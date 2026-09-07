import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Login/forgot-password specific throttler: keys the bucket by IP *and*
 * normalized email instead of IP alone. With `trust proxy` fixed (see
 * main.ts) the IP is now the real client IP, but this deployment can still
 * sit behind a shared address (e.g. a church's NAT/WLAN) - keying by
 * IP+email means one member mistyping their password repeatedly can't lock
 * out everyone else behind the same router, while repeated attempts
 * against the *same* account from the *same* IP are still throttled.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const ips = req.ips as string[] | undefined;
    const ip = ips?.length ? ips[0] : ((req.ip as string | undefined) ?? 'unknown');
    const body = req.body as { email?: unknown } | undefined;
    const email =
      typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    return email ? `${ip}:${email}` : ip;
  }
}
