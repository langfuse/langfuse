import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";

/**
 * Self-hosting newsletter signup for the onboarding step.
 *
 * The signup is proxied through langfuse.com rather than sent to Loops
 * directly: subscribing to a Loops mailing list requires a Loops API key, and a
 * self-hosted instance must never carry Langfuse-operated credentials. The
 * marketing site already exposes the proxy its own signup forms use, holds the
 * key, and maps the named `list` key onto a mailing list — so a self-hosted
 * instance only sends an email address and a source label.
 *
 * `list: "oss"` resolves to the "Langfuse OSS updates" mailing list, the same
 * one the signup form on langfuse.com/self-hosting/upgrade writes to. The list
 * is referenced by name rather than by id so an instance cannot inject an
 * arbitrary Loops list, and no Loops identifier needs to live in this repo.
 *
 * Posting from the server (not the browser) is required: the proxy sends no
 * CORS headers, so a cross-origin request from a self-hosted origin is blocked.
 * It also keeps the user's browser from contacting langfuse.com at all.
 */
const SIGNUP_ENDPOINT = "https://langfuse.com/api/productUpdateSignup";
const SIGNUP_LIST = "oss";
const SIGNUP_SOURCE = "self-host-onboarding";
const SIGNUP_TIMEOUT_MS = 5_000;

export type NewsletterSignupStatus = "subscribed" | "unavailable";

/**
 * Whether to offer the in-product signup at all.
 *
 * This is an intent check, not a connectivity check — reachability is only
 * knowable by trying, which `subscribeToNewsletter` does on explicit user
 * submit. Deliberately not probed on page load: `public.checkUpdate` shows what
 * that costs on an airgapped instance, where it logs a failure on every mount.
 */
export const isNewsletterSignupAvailable = () =>
  // On Langfuse Cloud the marketing site owns newsletter signup.
  !env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
  // Operators who switched off the telemetry ping opted out of calls to
  // Langfuse-operated services. Honor that instead of offering a form whose
  // only possible outcome is a failed request.
  env.TELEMETRY_ENABLED !== "false";

export const subscribeToNewsletter = async ({
  email,
}: {
  email: string;
}): Promise<NewsletterSignupStatus> => {
  if (!isNewsletterSignupAvailable()) return "unavailable";

  try {
    const response = await fetch(SIGNUP_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        list: SIGNUP_LIST,
        source: SIGNUP_SOURCE,
      }),
      signal: AbortSignal.timeout(SIGNUP_TIMEOUT_MS),
    });

    if (!response.ok) {
      logger.warn(
        "[onboarding.newsletter] signup proxy rejected the request, falling back to the hosted form",
        { status: response.status },
      );
      return "unavailable";
    }

    return "subscribed";
  } catch (error) {
    // Airgapped and otherwise offline instances land here. Expected for those
    // deployments, so this is not reported as an application error.
    logger.info(
      "[onboarding.newsletter] signup proxy unreachable, falling back to the hosted form",
      { error },
    );
    return "unavailable";
  }
};
