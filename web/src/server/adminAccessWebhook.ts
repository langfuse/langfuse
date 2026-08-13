import { env } from "@/src/env.mjs";
import {
  fetchWithSecureRedirects,
  logger,
  type RedirectUrlValidator,
  validateWebhookURL,
  type WebhookValidationWhitelist,
  whitelistFromEnv,
} from "@langfuse/shared/src/server";

type AdminAccessWebhookPayload = {
  email: string;
  timestamp: string;
  project: string | null;
  org: string | null;
  region: string;
};

const DEDUPE_WINDOW_MS = 24 * 60 * 60_000;
// Callers await this helper on user-facing request paths (tRPC procedures,
// dashboard query streaming, trace export). Without a deadline, an
// unresponsive webhook endpoint stalls those requests for as long as it takes
// the connection to die, so cap every delivery attempt. Matches the deadline
// the web callout sender applies to its own outbound requests.
const DELIVERY_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 10;
const URL_VALIDATION_LOG_CONTEXT = "Admin access webhook";
const lastWebhookByKey = new Map<string, number>();

export const resetAdminAccessWebhookCacheForTests = () => {
  lastWebhookByKey.clear();
};

const shouldSkipDueToRecentDuplicate = (payload: AdminAccessWebhookPayload) => {
  const dedupeKey = [payload.email, payload.project, payload.org].join(":");
  const nowMs = Date.now();
  const lastSentMs = lastWebhookByKey.get(dedupeKey);

  if (lastSentMs && nowMs - lastSentMs < DEDUPE_WINDOW_MS) {
    return true;
  }

  lastWebhookByKey.set(dedupeKey, nowMs);
  return false;
};

// The endpoint is operator-configured (env var), not tenant-supplied, so
// internal targets are legitimate here: self-hosted deployments whitelist them
// via LANGFUSE_WEBHOOK_WHITELISTED_*, and local development gets localhost for
// free, mirroring the web callout sender.
const LOCAL_DEVELOPMENT_WHITELIST: WebhookValidationWhitelist = {
  hosts: ["localhost", "127.0.0.1", "[::1]"],
  ips: ["127.0.0.1", "::1"],
  ip_ranges: ["127.0.0.0/8", "::1/128"],
};

const adminAccessWebhookWhitelist = (): WebhookValidationWhitelist => {
  const whitelist = whitelistFromEnv();

  if (env.NODE_ENV !== "development") {
    return whitelist;
  }

  return {
    hosts: [...whitelist.hosts, ...LOCAL_DEVELOPMENT_WHITELIST.hosts],
    ips: [...whitelist.ips, ...LOCAL_DEVELOPMENT_WHITELIST.ips],
    ip_ranges: [
      ...whitelist.ip_ranges,
      ...LOCAL_DEVELOPMENT_WHITELIST.ip_ranges,
    ],
  };
};

// Operator-configured receivers commonly listen on custom ports, so unlike
// tenant-facing webhooks the port is unrestricted.
const validateAdminAccessWebhookUrl: RedirectUrlValidator = (
  url,
  whitelist = adminAccessWebhookWhitelist(),
) => validateWebhookURL(url, whitelist, { allowedPorts: "any" });

export const sendAdminAccessWebhook = async (params: {
  email: string | null | undefined;
  projectId?: string | null;
  orgId?: string | null;
}) => {
  if (!env.LANGFUSE_ADMIN_ACCESS_WEBHOOK) return;
  if (!params.email) return;

  logger.info("Sending admin access webhook", {
    email: params.email,
    projectId: params.projectId,
    orgId: params.orgId,
  });

  const payload: AdminAccessWebhookPayload = {
    email: params.email,
    timestamp: new Date().toISOString(),
    project: params.projectId ?? null,
    org: params.orgId ?? null,
    region: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION ?? "self-hosted",
  };

  if (shouldSkipDueToRecentDuplicate(payload)) return;

  // An explicit controller rather than `AbortSignal.timeout`, so the deadline
  // runs on the ambient `setTimeout` and stays observable to tests.
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort(
      new Error(
        `Admin access webhook timed out after ${DELIVERY_TIMEOUT_MS}ms`,
      ),
    );
  }, DELIVERY_TIMEOUT_MS);

  try {
    const whitelist = adminAccessWebhookWhitelist();
    await validateAdminAccessWebhookUrl(
      env.LANGFUSE_ADMIN_ACCESS_WEBHOOK,
      whitelist,
    );

    const { response } = await fetchWithSecureRedirects(
      env.LANGFUSE_ADMIN_ACCESS_WEBHOOK,
      {
        method: "POST",
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
        },
        signal: abortController.signal,
      },
      {
        maxRedirects: MAX_REDIRECTS,
        redirectValidation: {
          validateUrl: validateAdminAccessWebhookUrl,
          whitelist,
          logContext: URL_VALIDATION_LOG_CONTEXT,
        },
      },
    );

    // Release the pooled connection; the receiver's body is never used.
    await response.body?.cancel().catch(() => {});

    if (!response.ok) {
      logger.warn("Failed to send admin access webhook", {
        status: response.status,
        statusText: response.statusText,
        email: payload.email,
        project: payload.project,
        org: payload.org,
      });
    }
  } catch (error) {
    logger.warn("Error while sending admin access webhook", {
      error,
      email: payload.email,
      project: payload.project,
      org: payload.org,
    });
  } finally {
    clearTimeout(timeout);
  }
};
