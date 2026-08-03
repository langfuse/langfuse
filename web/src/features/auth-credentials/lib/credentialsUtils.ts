import { z } from "zod";
import { env } from "@/src/env.mjs";

const DEFAULT_CUTOFF_MINUTES = 10;

/**
 * Checks if the email is verified. Verification can expire to make password reset safe.
 *
 * @param emailVerifiedDateTime - The date when the email was verified. Stringified date in ISO format.
 * @param cutoffMinutes - How many minutes the verification is valid for. Defaults to 10.
 */
export function isEmailVerifiedWithinCutoff(
  emailVerifiedDateTime: string | null | undefined,
  cutoffMinutes: number = DEFAULT_CUTOFF_MINUTES,
):
  | {
      verified: false;
      reason: "not_verified" | "verification_expired";
    }
  | { verified: true; reason: null } {
  if (!emailVerifiedDateTime)
    return { verified: false, reason: "not_verified" };

  const typed = z.iso.datetime().safeParse(emailVerifiedDateTime);
  if (!typed.success) {
    throw new Error("Invalid date string provided for emailVerifiedDateTime");
  }

  const cutoffUtc = new Date(
    Date.now() - cutoffMinutes * 60 * 1000,
  ).toISOString();
  if (typed.data <= cutoffUtc) {
    return { verified: false, reason: "verification_expired" };
  }
  return { verified: true, reason: null };
}

/**
 * Returns true when email verification on signup is required.
 * Requires: AUTH_EMAIL_VERIFICATION_REQUIRED=true AND SMTP configured.
 */
export function isEmailVerificationRequired(): boolean {
  return (
    env.AUTH_EMAIL_VERIFICATION_REQUIRED === "true" &&
    env.SMTP_CONNECTION_URL !== undefined &&
    env.EMAIL_FROM_ADDRESS !== undefined
  );
}
