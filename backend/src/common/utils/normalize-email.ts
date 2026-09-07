import { Transform } from 'class-transformer';

/** trim + lowercase, matching how emails are stored (see users.service.ts, auth.service.ts). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Class-validator/transformer decorator: normalizes an `email` DTO field to
 * lowercase+trimmed before validation runs, so `@IsEmail()` and downstream
 * lookups always see the canonical form. Login previously failed for users
 * whose email had different casing than what was stored - this closes that
 * gap at every entry point instead of relying on each call site to remember.
 */
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );
}
