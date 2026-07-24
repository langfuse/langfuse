import { describe, expect, it, vi } from "vitest";

import {
  getEffectiveSignupMode,
  normalizeSignupEmail,
  validateSignupModeEligibilityForMode,
} from "@/src/features/auth/lib/signupMode";

describe("signupPolicy", () => {
  describe("getEffectiveSignupMode", () => {
    it("defaults to open signup", () => {
      expect(getEffectiveSignupMode({})).toBe("open");
    });

    it("uses AUTH_SIGNUP_MODE when no legacy disable flag is set", () => {
      expect(getEffectiveSignupMode({ authSignupMode: "invite-only" })).toBe(
        "invite-only",
      );
      expect(getEffectiveSignupMode({ authSignupMode: "disabled" })).toBe(
        "disabled",
      );
    });

    it("lets existing disable flags override AUTH_SIGNUP_MODE", () => {
      expect(
        getEffectiveSignupMode({
          authDisableSignup: "true",
          authSignupMode: "invite-only",
        }),
      ).toBe("disabled");

      expect(
        getEffectiveSignupMode({
          authSignupMode: "invite-only",
          nextPublicSignUpDisabled: "true",
        }),
      ).toBe("disabled");
    });
  });

  it("normalizes signup email addresses before invitation lookup", () => {
    expect(normalizeSignupEmail("  New.User@Example.COM ")).toBe(
      "new.user@example.com",
    );
  });

  describe("validateSignupModeEligibilityForMode", () => {
    it("allows open signup without checking invitations", async () => {
      const hasPendingInvitation = vi.fn();

      await expect(
        validateSignupModeEligibilityForMode({
          email: "user@example.com",
          signupMode: "open",
          hasPendingInvitation,
        }),
      ).resolves.toBeNull();
      expect(hasPendingInvitation).not.toHaveBeenCalled();
    });

    it("blocks disabled signup without checking invitations", async () => {
      const hasPendingInvitation = vi.fn();

      await expect(
        validateSignupModeEligibilityForMode({
          email: "user@example.com",
          signupMode: "disabled",
          hasPendingInvitation,
        }),
      ).resolves.toBe("Sign up is disabled.");
      expect(hasPendingInvitation).not.toHaveBeenCalled();
    });

    it("requires a pending invitation in invite-only mode", async () => {
      await expect(
        validateSignupModeEligibilityForMode({
          email: "user@example.com",
          signupMode: "invite-only",
          hasPendingInvitation: vi.fn().mockResolvedValue(false),
        }),
      ).resolves.toBe("Sign up requires an invitation.");

      await expect(
        validateSignupModeEligibilityForMode({
          email: "user@example.com",
          signupMode: "invite-only",
          hasPendingInvitation: vi.fn().mockResolvedValue(true),
        }),
      ).resolves.toBeNull();
    });
  });
});
