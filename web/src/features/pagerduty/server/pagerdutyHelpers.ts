import { type Session } from "next-auth";
import {
  BaseError,
  ForbiddenError,
  InvalidRequestError,
  isPagerDutyActionConfig,
  type ActionCreate,
  type PagerDutyActionConfigWithSecrets,
} from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { prisma } from "@langfuse/shared/src/db";
import {
  isRetryablePagerDutyError,
  maskPagerDutyRoutingKey,
  pagerDutyClient,
  type PagerDutyAlertEvent,
  type PagerDutyRegion,
  type PagerDutyTestEventStep,
} from "@langfuse/shared/pagerduty/server";
import { getProductBaseUrl, logger } from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";

/** throwIfPagerDutyUnavailable limits PagerDuty actions to Langfuse Cloud admins. */
export function throwIfPagerDutyUnavailable(session: Session): void {
  if (env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION && session.user?.admin === true)
    return;
  throw new ForbiddenError("PagerDuty actions are not available yet");
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
    throw new InvalidRequestError("Invalid PagerDuty action configuration");
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
    throw new InvalidRequestError("PagerDuty routing key is required");
  }
  return { ...existing, region: actionConfig.region };
}

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

/** sendPagerDutyTestEvent triggers or resolves the project's test alert, which is keyed by project. */
export async function sendPagerDutyTestEvent({
  projectId,
  region,
  routingKey,
  actionId,
  step,
}: {
  projectId: string;
  region: PagerDutyRegion;
  routingKey?: string;
  actionId?: string;
  step: PagerDutyTestEventStep;
}): Promise<void> {
  const key = await resolveTestRoutingKey({ projectId, routingKey, actionId });
  const event = await buildTestEvent({ projectId, routingKey: key, step });
  try {
    await pagerDutyClient.alert({ region, event });
  } catch (error) {
    throw toTestEventError(error, projectId);
  }
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
    throw new InvalidRequestError(
      "Enter a PagerDuty routing key to send a test event",
    );
  }
  return decrypt(existing.routingKey);
}

/** buildTestEvent resolves the test alert, or triggers it at critical severity. */
async function buildTestEvent({
  projectId,
  routingKey,
  step,
}: {
  projectId: string;
  routingKey: string;
  step: PagerDutyTestEventStep;
}): Promise<PagerDutyAlertEvent> {
  const dedupKey = `langfuse-${projectId}-test`;
  if (step === "resolve") {
    return {
      routing_key: routingKey,
      event_action: "resolve",
      dedup_key: dedupKey,
    };
  }

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { name: true },
  });
  const projectUrl = new URL(
    `project/${projectId}`,
    getProductBaseUrl(),
  ).toString();
  return {
    routing_key: routingKey,
    event_action: "trigger",
    dedup_key: dedupKey,
    client: "Langfuse",
    client_url: projectUrl,
    links: [{ href: projectUrl, text: "Open Langfuse project" }],
    payload: {
      summary: `[Langfuse] Test event from project ${project.name}`,
      source: `langfuse/${project.name}`,
      severity: "critical",
      timestamp: new Date().toISOString(),
      class: "test",
      custom_details: {
        message:
          "This is a test event from Langfuse to verify your PagerDuty automation. Resolve it from the automation form or in PagerDuty.",
      },
    },
  };
}

/** toTestEventError keeps rate limits and outages as they are and turns any other PagerDuty rejection into an InvalidRequestError. */
function toTestEventError(error: unknown, projectId: string): unknown {
  if (!(error instanceof BaseError)) return error;
  logger.warn("Failed to send PagerDuty test event", {
    projectId,
    status: error.httpCode,
    error: error.message,
  });
  if (isRetryablePagerDutyError(error)) return error;
  return new InvalidRequestError(
    `PagerDuty did not accept the test event. Check the routing key and region. (${error.message})`,
  );
}
