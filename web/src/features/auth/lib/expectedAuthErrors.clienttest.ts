import {
  isExpectedSignInError,
  isExpectedAuthErrorPageMessage,
} from "@/src/features/auth/lib/expectedAuthErrors";
import { MULTI_TENANT_SSO_DOMAIN_MISMATCH_MESSAGE } from "@/src/features/auth/constants";

describe("expectedAuthErrors", () => {
  describe("isExpectedSignInError", () => {
    it.each(["OAuthCallback", "Callback"])(
      "classifies %s as expected (user-caused / provider-transient)",
      (code) => {
        expect(isExpectedSignInError(code)).toBe(true);
      },
    );

    // Negative fixtures: codes that indicate misconfiguration or genuine
    // failures must stay captured. An unknown code is never expected.
    it.each([
      "OAuthSignin", // authorization-URL construction failed → misconfig
      "OAuthCreateAccount", // DB user creation failed
      "EmailCreateAccount",
      "EmailSignin", // verification email failed to send
      "Signin",
      "Configuration",
      "SessionRequired",
      "CredentialsSignin",
      "credentials", // observed unknown string, must capture
      "acme.com.azure-ad", // provider-id-shaped unknown string, must capture
      "",
    ])("keeps %j captured", (code) => {
      expect(isExpectedSignInError(code)).toBe(false);
    });

    it("is case-sensitive (a mangled code is an unknown code)", () => {
      expect(isExpectedSignInError("oauthcallback")).toBe(false);
    });
  });

  describe("isExpectedAuthErrorPageMessage", () => {
    it("classifies Verification (expired/used magic link) as expected", () => {
      expect(isExpectedAuthErrorPageMessage("Verification")).toBe(true);
    });

    it("classifies the deliberate SSO domain rejection as expected", () => {
      expect(
        isExpectedAuthErrorPageMessage(
          MULTI_TENANT_SSO_DOMAIN_MISMATCH_MESSAGE,
        ),
      ).toBe(true);
    });

    // Negative fixtures: real auth-system failures must stay captured.
    it.each([
      "Configuration", // server misconfiguration
      "AccessDenied",
      "Default",
      "undefined", // observed literal-string artifact, must capture
      "Some unexpected IdP failure",
      "",
    ])("keeps %j captured", (message) => {
      expect(isExpectedAuthErrorPageMessage(message)).toBe(false);
    });

    it("matches the full message only (no substring matching)", () => {
      expect(
        isExpectedAuthErrorPageMessage(
          `prefix ${MULTI_TENANT_SSO_DOMAIN_MISMATCH_MESSAGE}`,
        ),
      ).toBe(false);
    });
  });
});
