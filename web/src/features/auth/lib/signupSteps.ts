import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";
import { getServerPosthog } from "@/src/features/posthog-analytics/ServerPosthog";
import { isProductionCloudRegion } from "@/src/features/auth/lib/createProjectMembershipsOnSignup";
import type { EmailCodeCheck } from "@/src/features/auth-credentials/lib/credentialsServerUtils";

type SignupStepProperties = {
  "sign_up:code_sent": { isResend: boolean };
  "sign_up:code_checked": { result: EmailCodeCheck };
  "sign_up:password_set": Record<string, never>;
  "sign_up:webhook_sent": { result: "ok" | "timeout" | "error" };
  "sign_up:completed_via_link": { provider: string };
};

const WEBHOOK_TIMEOUT_MS = 5000;

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

/**
 * Sends the sign-up webhook in production Cloud regions and records
 * sign_up:webhook_sent with its result. Never throws, so callers run it in the
 * background and a failing consumer never fails or slows the sign-up.
 */
export async function sendSignupWebhook(
  user: { id: string; email: string | null; name: string | null },
  webhookFields?: { referralSource?: string },
) {
  if (!isProductionCloudRegion() || !env.LANGFUSE_NEW_USER_SIGNUP_WEBHOOK)
    return;
  let result: "ok" | "timeout" | "error" = "ok";
  try {
    const response = await fetch(env.LANGFUSE_NEW_USER_SIGNUP_WEBHOOK, {
      method: "POST",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      body: JSON.stringify({
        name: user.name,
        email: user.email,
        ...webhookFields,
        cloudRegion: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
        userId: user.id,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      result = "error";
      logger.warn("Sign-up webhook failed", {
        userId: user.id,
        status: response.status,
      });
    }
  } catch (error) {
    result =
      error instanceof Error && error.name === "TimeoutError"
        ? "timeout"
        : "error";
    logger.warn("Sign-up webhook failed", {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  captureSignupStep(user.id, "sign_up:webhook_sent", { result });
}
