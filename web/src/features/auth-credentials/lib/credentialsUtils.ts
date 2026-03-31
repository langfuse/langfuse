import { z } from "zod";

const CUTOFF_MINUTES = 5;

/**
 * Checks if the email is verified. Verification can expire to make password reset safe.
 *
 * @param isVerified - The date when the email was verified. Stringified date in ISO format.
 */

export function isEmailVerifiedWithinCutoff(
  emailVerifiedDateTime: string | null | undefined,
):
  | {
      verified: false;
      reason: "not_verified" | "verification_expired";
    }
  | { verified: true; reason: null } {
  if (!emailVerifiedDateTime)
    return { verified: false, reason: "not_verified" };

  const typed = z.string().datetime().safeParse(emailVerifiedDateTime);
  if (!typed.success) {
    throw new Error("Invalid date string provided for emailVerifiedDateTime");
  }

  const fiveMinutesAgoUtc = new Date(
    Date.now() - CUTOFF_MINUTES * 60 * 1000,
  ).toISOString();
  if (typed.data <= fiveMinutesAgoUtc) {
    return { verified: false, reason: "verification_expired" };
  }
  return { verified: true, reason: null };
}
