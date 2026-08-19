import * as z from "zod";

/**
 * Email field schema for the auth forms.
 *
 * Strips leading/trailing whitespace before validating, so an address pasted
 * with a stray space or entered on a mobile keyboard that appends one is
 * accepted instead of failing with "Invalid email address" (issue #15780).
 * Case is preserved here for display; the server lowercases on lookup/write
 * via {@link normalizeEmail}.
 */
export const emailSchema = z.string().trim().pipe(z.email());

/**
 * Normalize an email for storage and lookup: strip surrounding whitespace and
 * lowercase. Use this once, up front, wherever an email is turned into a
 * database key — both the user lookup and any domain-derived SSO checks must
 * read the same normalized value, otherwise a trailing space could skip SSO
 * enforcement while still matching a user (issue #15780).
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
