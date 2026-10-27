import { randomUUID } from "crypto";
import { backOff } from "exponential-backoff";
import { TRPCError } from "@trpc/server";

import {
  isPagerDutyActionConfig,
  type ActionCreate,
  type PagerDutyActionConfigWithSecrets,
} from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { prisma } from "@langfuse/shared/src/db";
import {
  maskPagerDutyRoutingKey,
  PagerDutyApiError,
  sendPagerDutyAlertEvent,
  type PagerDutyAlertEvent,
  type PagerDutyRegion,
} from "@langfuse/shared/pagerduty/server";
import { getProductBaseUrl, logger } from "@langfuse/shared/src/server";

/** getStoredPagerDutyConfig loads the PagerDuty config of an existing action, or null when there is none. */
async function getStoredPagerDutyConfig({
  actionId,
  projectId,
}: {
  actionId?: string;
  projectId: string;
}): Promise<PagerDutyActionConfigWithSecrets | null> {
  if (!actionId) return null;
  const action = await prisma.action.findFirst({
    where: { id: actionId, projectId },
    select: { config: true },
  });
  const config = action?.config;
  if (!isPagerDutyActionConfig(config)) return null;
  return config;
}

/** resolveTestRoutingKey prefers the typed key and falls back to the stored key of the action. */
async function resolveTestRoutingKey({
  projectId,
  routingKey,
  actionId,
}: {
  projectId: string;
  routingKey?: string;
  actionId?: string;
}): Promise<string> {
  if (routingKey) return routingKey;
  const existing = await getStoredPagerDutyConfig({ actionId, projectId });
  if (!existing) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Enter a PagerDuty routing key to send a test event",
    });
  }
  return decrypt(existing.routingKey);
}

/** buildTestEventPayload describes the test alert. */
function buildTestEventPayload(
  projectName: string,
): NonNullable<PagerDutyAlertEvent["payload"]> {
  return {
    summary: `[Langfuse] Test event from project ${projectName}`,
    source: `langfuse/${projectName}`,
    severity: "info",
    timestamp: new Date().toISOString(),
    class: "test",
    custom_details: {
      message:
        "This is a test event from Langfuse to verify your PagerDuty automation. It is resolved automatically.",
    },
  };
}

/** toTestEventError maps a failed PagerDuty call to a user-facing tRPC error. */
function toTestEventError(error: unknown, projectId: string): unknown {
  if (!(error instanceof PagerDutyApiError)) return error;
  logger.warn("Failed to send PagerDuty test event", {
    projectId,
    status: error.status,
    error: error.message,
  });
  if (error.status === 429) {
    return new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "PagerDuty rate-limited the test event. Try again shortly.",
    });
  }
  return new TRPCError({
    code: "BAD_REQUEST",
    message: `PagerDuty did not accept the test event. Check the routing key and region. (${error.message})`,
  });
}

/** processPagerDutyActionConfig encrypts a new routing key, or keeps the stored one when the update omits it. */
export async function processPagerDutyActionConfig({
  actionConfig,
  actionId,
  projectId,
}: {
  actionConfig: ActionCreate;
  actionId?: string;
  projectId: string;
}): Promise<PagerDutyActionConfigWithSecrets> {
  if (actionConfig.type !== "PAGERDUTY") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid PagerDuty action configuration",
    });
  }

  if (actionConfig.routingKey) {
    return {
      type: "PAGERDUTY",
      routingKey: encrypt(actionConfig.routingKey),
      displayRoutingKey: maskPagerDutyRoutingKey(actionConfig.routingKey),
      region: actionConfig.region,
    };
  }

  const existing = await getStoredPagerDutyConfig({ actionId, projectId });
  if (!existing) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "PagerDuty routing key is required",
    });
  }
  return { ...existing, region: actionConfig.region };
}

/** resolveTestEvent resolves the test incident, retrying 429, 5xx and network errors. */
async function resolveTestEvent({
  region,
  routingKey,
  dedupKey,
  projectId,
}: {
  region: PagerDutyRegion;
  routingKey: string;
  dedupKey: string;
  projectId: string;
}): Promise<void> {
  try {
    await backOff(
      () =>
        sendPagerDutyAlertEvent({
          region,
          event: {
            routing_key: routingKey,
            event_action: "resolve",
            dedup_key: dedupKey,
          },
        }),
      {
        numOfAttempts: 4,
        retry: (error: unknown) =>
          error instanceof PagerDutyApiError && error.isRetryable,
      },
    );
  } catch (error) {
    logger.warn("Failed to resolve PagerDuty test event", {
      projectId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TRPCError({
      code: "CONFLICT",
      message: `PagerDuty opened the test incident but Langfuse could not resolve it. Resolve it in PagerDuty (dedup key ${dedupKey}).`,
    });
  }
}

/** sendPagerDutyTestEvent triggers and then resolves one test alert, so whoever is on call is paged briefly. */
export async function sendPagerDutyTestEvent({
  projectId,
  region,
  routingKey,
  actionId,
}: {
  projectId: string;
  region: PagerDutyRegion;
  routingKey?: string;
  actionId?: string;
}): Promise<void> {
  const key = await resolveTestRoutingKey({ projectId, routingKey, actionId });
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { name: true },
  });
  const dedupKey = `langfuse-${projectId}-test-${randomUUID()}`;
  const projectUrl = new URL(
    `project/${projectId}`,
    getProductBaseUrl(),
  ).toString();

  try {
    await sendPagerDutyAlertEvent({
      region,
      event: {
        routing_key: key,
        event_action: "trigger",
        dedup_key: dedupKey,
        client: "Langfuse",
        client_url: projectUrl,
        links: [{ href: projectUrl, text: "Open Langfuse project" }],
        payload: buildTestEventPayload(project.name),
      },
    });
  } catch (error) {
    throw toTestEventError(error, projectId);
  }
  await resolveTestEvent({ region, routingKey: key, dedupKey, projectId });
}
