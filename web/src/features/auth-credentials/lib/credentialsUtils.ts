/**
 * Checks if the email is verified. Verification can expire to make password reset safe.
 */

export function isEmailVerified(isVerified: string | null | undefined):
  | {
      verified: false;
      reason: "not_verified" | "verification_expired";
    }
  | { verified: true; reason: null } {
  if (!isVerified) return { verified: false, reason: "not_verified" };
  const fiveMinutesAgoUtc = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  if (isVerified <= fiveMinutesAgoUtc) {
    return { verified: false, reason: "verification_expired" };
  }
  return { verified: true, reason: null };
}
