import { env } from "@/src/env.mjs";
import {
  getEffectiveSignupMode as getEffectiveSignupModeFromConfig,
  normalizeSignupEmail,
  validateSignupModeEligibilityForMode,
  type SignupModeConfig,
} from "@/src/features/auth/lib/signupMode";

export {
  normalizeSignupEmail,
  signupModes,
  validateSignupModeEligibilityForMode,
  type SignupMode,
  type SignupModeConfig,
} from "@/src/features/auth/lib/signupMode";

const getSignupModeConfig = (): SignupModeConfig => ({
  authDisableSignup: env.AUTH_DISABLE_SIGNUP,
  authSignupMode: env.AUTH_SIGNUP_MODE,
  nextPublicSignUpDisabled: env.NEXT_PUBLIC_SIGN_UP_DISABLED,
});

export function getEffectiveSignupMode(
  config: SignupModeConfig = getSignupModeConfig(),
): ReturnType<typeof getEffectiveSignupModeFromConfig> {
  return getEffectiveSignupModeFromConfig(config);
}

export async function hasPendingMembershipInvitation(email: string) {
  const { prisma } = await import("@langfuse/shared/src/db");

  const invitation = await prisma.membershipInvitation.findFirst({
    where: {
      email: normalizeSignupEmail(email),
    },
    select: {
      id: true,
    },
  });

  return Boolean(invitation);
}

export async function validateSignupModeEligibility({
  email,
}: {
  email: string;
}) {
  return validateSignupModeEligibilityForMode({
    email,
    signupMode: getEffectiveSignupMode(),
    hasPendingInvitation: hasPendingMembershipInvitation,
  });
}
