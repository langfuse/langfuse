import { MULTI_TENANT_SSO_DOMAIN_MISMATCH_MESSAGE } from "@/src/features/auth/constants";

/**
 * Classify NextAuth error outcomes surfaced in the browser
 * (https://next-auth.js.org/configuration/pages).
 *
 * Allowlisted values are user-caused or provider-transient outcomes the UI
 * already renders — they breadcrumb instead of capturing (see `reportError`).
 * Every server-actionable variant of these failures is logged server-side by
 * NextAuth through `nextAuthLogger` (`[NEXT_AUTH] OAUTH_CALLBACK_ERROR`, …),
 * so a systemic auth breakage stays visible without the client copy.
 * Anything NOT listed here still captures: an explicit allowlist, never a
 * catch-all.
 */

// Sign-in page `?error=` codes (next-auth v4 redirects these to pages.signIn):
// - OAuthCallback: user cancelled at the provider, expired/mismatched state
//   cookie, or a provider hiccup during the token exchange. Server-side,
//   next-auth logs `OAUTH_CALLBACK_ERROR` before issuing this redirect.
// - Callback: error thrown in the callback route; always preceded by a
//   server-side `OAUTH_CALLBACK_ERROR` / `OAUTH_CALLBACK_HANDLER_ERROR` /
//   `CALLBACK_EMAIL_ERROR` log.
// Deliberately NOT listed (still capture): OAuthSignin (authorization-URL
// construction = provider misconfig), OAuthCreateAccount / EmailCreateAccount
// (DB failures), EmailSignin (verification email failed to send), Signin,
// Configuration, and any unknown/custom string.
export const EXPECTED_SIGN_IN_ERROR_CODES: readonly string[] = [
  "OAuthCallback",
  "Callback",
];

export const isExpectedSignInError = (code: string): boolean =>
  EXPECTED_SIGN_IN_ERROR_CODES.includes(code);

// /auth/error `?error=` values:
// - Verification: the magic-link token expired or was already used. NextAuth
//   emits this value only for the clean invalid-token outcome — infra failures
//   in the same flow throw and take the server-logged error paths instead, so
//   this value is user-caused by construction.
// - SSO domain mismatch: deliberate rejection thrown by our signIn callback
//   (logged server-side before the throw).
// Configuration / AccessDenied / unknown values still capture.
export const EXPECTED_AUTH_ERROR_PAGE_MESSAGES: readonly string[] = [
  "Verification",
  MULTI_TENANT_SSO_DOMAIN_MISMATCH_MESSAGE,
];

export const isExpectedAuthErrorPageMessage = (message: string): boolean =>
  EXPECTED_AUTH_ERROR_PAGE_MESSAGES.includes(message);
