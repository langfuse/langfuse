import { env } from "@/src/env.mjs";

export const PASSWORD_SETUP_EMAIL_STORAGE_KEY = "langfuse_password_setup_email";

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
