import { randomUUID } from "crypto";

import {
  LangfuseConflictError,
  LangfuseNotFoundError,
  type PagerDutyRegion,
} from "@langfuse/shared";
import { decrypt, encrypt } from "@langfuse/shared/encryption";
import { Prisma, prisma } from "@langfuse/shared/src/db";
import {
  maskPagerDutyRoutingKey,
  sendPagerDutyAlertEvent,
  type PagerDutyAlertEvent,
  type PagerDutyIntegrationListItem,
} from "@langfuse/shared/pagerduty/server";
import { getProductBaseUrl } from "@langfuse/shared/src/server";

const listItemSelect = {
  id: true,
  name: true,
  displayRoutingKey: true,
  region: true,
} satisfies Prisma.PagerDutyIntegrationSelect;

/** PagerDutyIntegrationInUseError rejects deleting a routing key that automations still send to. */
export class PagerDutyIntegrationInUseError extends LangfuseConflictError {
  constructor(public readonly automations: { id: string; name: string }[]) {
    super(
      `PagerDuty integration is used by ${automations.length} automation(s): ${automations.map((a) => a.name).join(", ")}. Remove it from these automations first.`,
    );
  }
}

/** getAutomationsUsingPagerDutyIntegration lists the automations whose action sends to the key. */
async function getAutomationsUsingPagerDutyIntegration(args: {
  projectId: string;
  id: string;
}): Promise<{ id: string; name: string }[]> {
  const actions = await prisma.action.findMany({
    where: {
      projectId: args.projectId,
      config: { path: ["pagerDutyIntegrationId"], equals: args.id },
    },
    select: { automations: { select: { id: true, name: true } } },
  });
  return actions.flatMap((action) => action.automations);
}

/** getPagerDutyIntegrationOrThrow loads one key of the project or throws not found. */
async function getPagerDutyIntegrationOrThrow(
  projectId: string,
  id: string,
): Promise<PagerDutyIntegrationListItem> {
  const integration = await prisma.pagerDutyIntegration.findFirst({
    where: { id, projectId },
    select: listItemSelect,
  });
  if (!integration) {
    throw new LangfuseNotFoundError("PagerDuty integration not found");
  }
  return integration;
}

/** withUniqueName turns a duplicate-name write into a conflict error. */
async function withUniqueName<T>(
  name: string,
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new LangfuseConflictError(
        `A PagerDuty integration named "${name}" already exists in this project`,
      );
    }
    throw error;
  }
}

/** rotatedRoutingKey returns the columns to write for a new routing key, if any. */
function rotatedRoutingKey(routingKey: string | undefined) {
  if (routingKey === undefined) return {};
  return {
    routingKey: encrypt(routingKey),
    displayRoutingKey: maskPagerDutyRoutingKey(routingKey),
  };
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
        "This is a test event from Langfuse to verify your PagerDuty integration. It is resolved automatically.",
    },
  };
}

/** listPagerDutyIntegrations returns a project's routing keys without the raw key. */
export function listPagerDutyIntegrations(
  projectId: string,
): Promise<PagerDutyIntegrationListItem[]> {
  return prisma.pagerDutyIntegration.findMany({
    where: { projectId },
    select: listItemSelect,
    orderBy: { name: "asc" },
  });
}

/** createPagerDutyIntegration stores an encrypted routing key under a project-unique name. */
export async function createPagerDutyIntegration(args: {
  projectId: string;
  name: string;
  routingKey: string;
  region: PagerDutyRegion;
  createdByUserId?: string;
}): Promise<PagerDutyIntegrationListItem> {
  return withUniqueName(args.name, () =>
    prisma.pagerDutyIntegration.create({
      data: {
        projectId: args.projectId,
        name: args.name,
        routingKey: encrypt(args.routingKey),
        displayRoutingKey: maskPagerDutyRoutingKey(args.routingKey),
        region: args.region,
        createdByUserId: args.createdByUserId,
      },
      select: listItemSelect,
    }),
  );
}

/** updatePagerDutyIntegration renames a key, rotates it or changes its region. */
export async function updatePagerDutyIntegration(args: {
  projectId: string;
  id: string;
  name?: string;
  routingKey?: string;
  region?: PagerDutyRegion;
}): Promise<{
  before: PagerDutyIntegrationListItem;
  after: PagerDutyIntegrationListItem;
}> {
  const before = await getPagerDutyIntegrationOrThrow(args.projectId, args.id);
  const after = await withUniqueName(args.name ?? before.name, () =>
    prisma.pagerDutyIntegration.update({
      where: { id: args.id, projectId: args.projectId },
      data: {
        name: args.name,
        region: args.region,
        ...rotatedRoutingKey(args.routingKey),
      },
      select: listItemSelect,
    }),
  );
  return { before, after };
}

/** deletePagerDutyIntegration removes a key no automation sends to. */
export async function deletePagerDutyIntegration(args: {
  projectId: string;
  id: string;
}): Promise<PagerDutyIntegrationListItem> {
  const before = await getPagerDutyIntegrationOrThrow(args.projectId, args.id);
  const automations = await getAutomationsUsingPagerDutyIntegration(args);
  if (automations.length > 0) {
    throw new PagerDutyIntegrationInUseError(automations);
  }
  await prisma.pagerDutyIntegration.delete({
    where: { id: args.id, projectId: args.projectId },
  });
  return before;
}

/** sendPagerDutyTestEvent triggers and then resolves one test alert, so whoever is on call is paged briefly. */
export async function sendPagerDutyTestEvent(args: {
  projectId: string;
  id: string;
}): Promise<void> {
  const integration = await prisma.pagerDutyIntegration.findFirst({
    where: { id: args.id, projectId: args.projectId },
    select: {
      routingKey: true,
      region: true,
      project: { select: { name: true } },
    },
  });
  if (!integration) {
    throw new LangfuseNotFoundError("PagerDuty integration not found");
  }

  const routingKey = decrypt(integration.routingKey);
  const dedupKey = `langfuse-${args.projectId}-test-${randomUUID()}`;
  const projectUrl = new URL(
    `project/${args.projectId}`,
    getProductBaseUrl(),
  ).toString();

  await sendPagerDutyAlertEvent({
    region: integration.region,
    event: {
      routing_key: routingKey,
      event_action: "trigger",
      dedup_key: dedupKey,
      client: "Langfuse",
      client_url: projectUrl,
      links: [{ href: projectUrl, text: "Open Langfuse project" }],
      payload: buildTestEventPayload(integration.project.name),
    },
  });
  await sendPagerDutyAlertEvent({
    region: integration.region,
    event: {
      routing_key: routingKey,
      event_action: "resolve",
      dedup_key: dedupKey,
    },
  });
}
