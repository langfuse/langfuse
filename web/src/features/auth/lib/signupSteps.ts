import { getServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";
import { isProductionCloudRegion } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import type { EmailCodeCheck } from "@/src/features/auth-credentials/lib/credentialsServerUtils";

type SignupStepProperties = {
  "sign_up:code_sent": { isResend: boolean };
  "sign_up:code_checked": { result: EmailCodeCheck };
  "sign_up:password_set": Record<string, never>;
};

/**
 * Captures a sign-up step in production Cloud regions, as
 * cloud_signup_complete is, on the shared client. Never throws or waits, so
 * tracking never fails or slows the step.
 */
export function captureSignupStep<Step extends keyof SignupStepProperties>(
  userId: string,
  event: Step,
  properties: SignupStepProperties[Step],
) {
  if (!isProductionCloudRegion()) return;
  try {
    getServerPosthog().capture({ distinctId: userId, event, properties });
  } catch {}
}
