// @vitest-environment node

import {
  isExpectedSignInError,
  isExpectedAuthErrorPageMessage,
  isNextAuthMissingSignInUrlError,
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

  describe("isNextAuthMissingSignInUrlError", () => {
    it.each([
      "URL constructor: undefined is not a valid URL.", // Firefox
      "Failed to construct 'URL': Invalid URL", // Chrome
      "undefined is not a valid URL.", // Safari / WebKit
    ])("classifies %j as next-auth's missing data.url throw", (message) => {
      expect(isNextAuthMissingSignInUrlError(new TypeError(message))).toBe(
        true,
      );
    });

    // Negative fixtures: other throws from signIn() must stay captured.
    it.each([
      new TypeError("Failed to fetch"),
      new TypeError("Cannot read properties of undefined (reading 'ok')"),
      new Error("URL constructor: undefined is not a valid URL."),
      "URL constructor: undefined is not a valid URL.",
    ])("keeps %s captured", (error) => {
      expect(isNextAuthMissingSignInUrlError(error)).toBe(false);
    });
  });
});
