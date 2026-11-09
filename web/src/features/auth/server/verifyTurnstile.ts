import { env } from "@/src/env.mjs";
import type { TurnstileAction } from "@/src/features/auth/constants";
import { logger } from "@langfuse/shared/src/server";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;

type SiteverifyResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

function getExpectedHostnames(): Set<string> {
  return new Set(
    (env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * First `x-forwarded-for` hop, passed to siteverify as an optional signal.
 * Cloudflare does not reject on a mismatch, so a spoofed header cannot bypass
 * the check.
 */
export function getTurnstileRemoteIp(
  headers: Record<string, unknown> | undefined,
): string | undefined {
  const forwarded = headers?.["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof value !== "string") return undefined;
  return value.split(",")[0]?.trim() || undefined;
}

/**
 * Returns true when Turnstile is disabled (no secret configured) or the token
 * passes siteverify with the expected action and an allowed hostname.
 * Any other outcome, including network errors, returns false.
 */
export async function verifyTurnstileToken({
  token,
  action,
  remoteIp,
}: {
  token: unknown;
  action: TurnstileAction;
  remoteIp?: string;
}): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return true;

  // The site key is baked into the client at build time. A secret without it
  // rejects every password sign-in while the page shows no captcha.
  if (!env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    logger.error(
      "Turnstile: TURNSTILE_SECRET is set but NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing from this build; rejecting",
    );
    return false;
  }

  const expectedHostnames = getExpectedHostnames();
  if (expectedHostnames.size === 0) {
    logger.error(
      "Turnstile: TURNSTILE_SECRET is set but TURNSTILE_HOSTNAMES is empty; rejecting",
    );
    return false;
  }

  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > MAX_TOKEN_LENGTH
  ) {
    logger.warn("Turnstile: missing or malformed token", { action });
    return false;
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let result: SiteverifyResponse;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`siteverify returned ${res.status}`);
    result = (await res.json()) as SiteverifyResponse;
  } catch (error) {
    logger.warn("Turnstile: siteverify request failed", {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }

  if (
    result.success !== true ||
    result.action !== action ||
    !result.hostname ||
    !expectedHostnames.has(result.hostname.toLowerCase())
  ) {
    logger.warn("Turnstile: token rejected", {
      expectedAction: action,
      action: result.action,
      hostname: result.hostname,
      errorCodes: result["error-codes"],
    });
    return false;
  }

  return true;
}
