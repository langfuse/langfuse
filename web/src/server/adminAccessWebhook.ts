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
// Callers await this helper on user-facing request paths (tRPC procedures,
// dashboard query streaming, trace export). Without a deadline, an
// unresponsive webhook endpoint stalls those requests for as long as it takes
// the connection to die, so cap every delivery attempt.
const DELIVERY_TIMEOUT_MS = 5_000;
const lastWebhookByKey = new Map<string, number>();

export const resetAdminAccessWebhookCacheForTests = () => {
  lastWebhookByKey.clear();
};

const getDedupeKey = (payload: AdminAccessWebhookPayload) =>
  [payload.email, payload.project, payload.org].join(":");

// Claims the dedupe slot up front so concurrent callers collapse onto a single
// delivery, and returns false when a recent delivery already covers this key.
// The claim is provisional: `releaseDeliverySlot` hands it back when delivery
// fails, so the reservation only becomes a real 24h suppression once the
// webhook has actually been delivered.
const claimDeliverySlot = (dedupeKey: string) => {
  const nowMs = Date.now();
  const lastSentMs = lastWebhookByKey.get(dedupeKey);

  if (lastSentMs && nowMs - lastSentMs < DEDUPE_WINDOW_MS) {
    return false;
  }

  lastWebhookByKey.set(dedupeKey, nowMs);
  return true;
};

// Deleting is enough to restore the previous state: reaching a delivery
// attempt means there was either no entry for this key, or one that had
// already aged out of the dedupe window, and both are equivalent to absent.
const releaseDeliverySlot = (dedupeKey: string) => {
  lastWebhookByKey.delete(dedupeKey);
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
      // Hand the slot back: a rejected delivery must not suppress the next
      // attempt for the full dedupe window.
      releaseDeliverySlot(dedupeKey);
      logger.warn("Failed to send admin access webhook", {
        status: response.status,
        statusText: response.statusText,
        email: payload.email,
        project: payload.project,
        org: payload.org,
      });
    }
  } catch (error) {
    releaseDeliverySlot(dedupeKey);
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
