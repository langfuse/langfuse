import { z } from "zod";

/**
 * userEmailFilterSchema validates an `email` query filter and lowercases it,
 * matching the session lookup in `web/src/server/auth.ts`. Stored emails can
 * be non-email userNames (SCIM), so only the length is bounded.
 */
export const userEmailFilterSchema = z
  .string()
  .min(1)
  .max(320)
  .transform((email) => email.toLowerCase());
