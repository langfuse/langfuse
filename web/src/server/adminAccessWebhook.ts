import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";

type AdminAccessWebhookPayload = {
  email: string;
  timestamp: string;
  project: string | null;
  org: string | null;
  region: string;
};

const DEDUPE_WINDOW_MS = 24 * 60 * 60_000;
// A failed delivery hands its slot back early so the notification is not lost
// for a full day, but not immediately: an admin session emits one event per
// tRPC procedure call, and every one of them awaits this helper. Retrying each
// of them against a dead endpoint would charge DELIVERY_TIMEOUT_MS to every
// admin request, so failures stay suppressed for a short cooldown instead.
const FAILED_DELIVERY_COOLDOWN_MS = 60_000;
// Callers await this helper on user-facing request paths (tRPC procedures,
// dashboard query streaming, trace export). Without a deadline, an
// unresponsive webhook endpoint stalls those requests for as long as it takes
// the connection to die, so cap every delivery attempt. Matches the deadline
// the web callout sender applies to its own outbound requests.
const DELIVERY_TIMEOUT_MS = 5_000;
const suppressedUntilByKey = new Map<string, number>();

export const resetAdminAccessWebhookCacheForTests = () => {
  suppressedUntilByKey.clear();
};

const getDedupeKey = (payload: AdminAccessWebhookPayload) =>
  [payload.email, payload.project, payload.org].join(":");

// Claims the delivery slot up front so concurrent callers collapse onto a
// single delivery, and returns false while a recent delivery — or a recent
// failed attempt — still suppresses this key. The claim is provisional:
// `suppressAfterFailedDelivery` shortens it when delivery fails, so the full
// 24h suppression only survives a webhook that was actually delivered.
const claimDeliverySlot = (dedupeKey: string) => {
  const nowMs = Date.now();
  const suppressedUntilMs = suppressedUntilByKey.get(dedupeKey);

  if (suppressedUntilMs !== undefined && nowMs < suppressedUntilMs) {
    return false;
  }

  suppressedUntilByKey.set(dedupeKey, nowMs + DEDUPE_WINDOW_MS);
  return true;
};

const suppressAfterFailedDelivery = (dedupeKey: string) => {
  suppressedUntilByKey.set(dedupeKey, Date.now() + FAILED_DELIVERY_COOLDOWN_MS);
};

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

  const dedupeKey = getDedupeKey(payload);
  if (!claimDeliverySlot(dedupeKey)) return;

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
    const response = await fetch(env.LANGFUSE_ADMIN_ACCESS_WEBHOOK, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
      signal: abortController.signal,
    });

    if (!response.ok) {
      // A rejected delivery must not suppress the next attempt for the full
      // dedupe window.
      suppressAfterFailedDelivery(dedupeKey);
      logger.warn("Failed to send admin access webhook", {
        status: response.status,
        statusText: response.statusText,
        email: payload.email,
        project: payload.project,
        org: payload.org,
      });
    }
  } catch (error) {
    suppressAfterFailedDelivery(dedupeKey);
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
