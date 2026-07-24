export const signupModes = ["open", "disabled", "invite-only"] as const;

export type SignupMode = (typeof signupModes)[number];

export type SignupModeConfig = {
  authDisableSignup?: "true" | "false";
  authSignupMode?: SignupMode;
  nextPublicSignUpDisabled?: "true" | "false";
};

export function getEffectiveSignupMode(
  config: SignupModeConfig = {},
): SignupMode {
  if (
    config.nextPublicSignUpDisabled === "true" ||
    config.authDisableSignup === "true"
  ) {
    return "disabled";
  }

  return config.authSignupMode ?? "open";
}

export function normalizeSignupEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function validateSignupModeEligibilityForMode({
  email,
  signupMode,
  hasPendingInvitation,
}: {
  email: string;
  signupMode: SignupMode;
  hasPendingInvitation: (email: string) => Promise<boolean>;
}) {
  if (signupMode === "disabled") {
    return "Sign up is disabled.";
  }

  if (signupMode === "invite-only" && !(await hasPendingInvitation(email))) {
    return "Sign up requires an invitation.";
  }

  return null;
}
