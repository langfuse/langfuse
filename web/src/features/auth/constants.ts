export const ENTERPRISE_SSO_REQUIRED_MESSAGE =
  "You must sign in via custom Enterprise SSO for this domain. Enter your email on the sign-in page and press Continue.";

// Thrown by the NextAuth signIn callback (web/src/server/auth.ts) when a
// multi-tenant SSO provider is used with an email of a different domain.
// NextAuth redirects the thrown message verbatim to /auth/error?error=<message>,
// where it is matched to classify the render as an expected outcome.
export const MULTI_TENANT_SSO_DOMAIN_MISMATCH_MESSAGE =
  "This domain is not associated with this SSO provider.";

// Thrown by the credentials provider when LANGFUSE_REQUIRE_FIPS=true and the
// stored password is a bcrypt hash, which FIPS mode does not verify.
export const PASSWORD_RESET_REQUIRED_MESSAGE =
  'This instance runs in FIPS mode and your password must be reset. Use "forgot password?" to set a new one, or contact your administrator.';
