import { env } from "@/src/env.mjs";
import { logger } from "@langfuse/shared/src/server";

type AdminAccessWebhookPayload = {
  email: string;
  timestamp: string;
  project: string | null;
  org: string | null;
  region: string;
};

const DEDUPE_WINDOW_MS = 5 * 60_000;
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

  try {
    const response = await fetch(env.LANGFUSE_ADMIN_ACCESS_WEBHOOK, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
    });

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
  }
};
