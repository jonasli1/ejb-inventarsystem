-- Normalizes existing users.email values to lowercase, matching the new
-- application-level rule (all email fields are now trimmed+lowercased on
-- input, see NormalizeEmail()) so login lookups (case-sensitive by
-- default) work reliably regardless of how an address was originally typed
-- or entered by an admin.
--
-- Data-preserving with a hard safety check: if two existing users only
-- differ by email casing, blindly lowercasing would collide against the
-- unique(email) constraint (or silently make one address ambiguous). Rather
-- than auto-merging or dropping a row, this migration refuses to proceed
-- and reports exactly which addresses collide, so an operator can resolve
-- it manually (merge the accounts, or rename one) before re-running.
DO $$
DECLARE
  collision_report TEXT;
BEGIN
  SELECT string_agg(DISTINCT lower(email), ', ')
  INTO collision_report
  FROM users
  GROUP BY lower(email)
  HAVING count(*) > 1;

  IF collision_report IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot normalize user emails to lowercase: the following addresses are used by more than one account (differing only in case): %. Resolve these duplicates manually (merge or rename the accounts) and re-run this migration.',
      collision_report;
  END IF;
END $$;

UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");

-- Local-provider auth_identities.provider_subject mirrors the user's email
-- at creation/reset time (see UsersService) - keep it consistent too, even
-- though it isn't used for login lookups (only users.email is).
UPDATE "auth_identities"
SET "provider_subject" = lower("provider_subject")
WHERE "provider" = 'local' AND "provider_subject" <> lower("provider_subject");
