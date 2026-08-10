/**
 * Hosted signup form for the Langfuse self-hosting newsletter.
 *
 * Client-safe on purpose: the onboarding step links here when this instance
 * cannot reach the signup proxy itself, so the constant must not drag the
 * server-only newsletter service into the client bundle.
 */
export const NEWSLETTER_SIGNUP_FALLBACK_URL =
  "https://langfuse.com/self-hosting/upgrade";
