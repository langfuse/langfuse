import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { backOff } from "exponential-backoff";

import { env } from "@/src/env.mjs";
import { parseDbOrg } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { logger, recordIncrement } from "@langfuse/shared/src/server";

/**
 * Project lifecycle events for ClickHouse Billing (CHB).
 *
 * CHB needs to know which projects exist per organization to poll our billing
 * metrics API. Delivery is a direct best-effort cross-account EventBridge
 * PutEvents from web, no queue: the bus is an always-on managed endpoint;
 * absorbing brief unavailability is CHB's responsibility. At-most-once is
 * acceptable by design — a lost PROJECT_DELETED is benign (the metrics API
 * returns zeros for deleted projects by contract), a lost PROJECT_CREATED
 * delays metering for one project until CHB's own backfill pipeline catches
 * it. If `langfuse.billing_events.emit_failed` ever shows real loss, swap this
 * helper's internals for a queue — call sites keep the same signature.
 *
 * Sync starts at checkout, not at signup. Nothing is mirrored to CHB until
 * checkout persists `cloudConfig.clickhouse.organizationId`: before that CHB
 * has no organization to attribute a project to, so an event would be
 * unroutable, and the vast majority of orgs never check out at all.
 * `resolveChbOrganizationId` is the single gate enforcing this, and checkout
 * closes the gap it creates by calling `backfillChbProjectEvents` once for the
 * projects the org already had.
 */

export type ChbProjectEventType =
  | "LANGFUSE_PROJECT_CREATED"
  | "LANGFUSE_PROJECT_DELETED";

// EventBridge `source` for everything we publish. Free-form on our side; CHB's
// bus policy filters on detail-type, not source.
const CHB_EVENT_SOURCE = "langfuse";

const EVENT_BUS_REQUEST_TIMEOUT_MS = 5_000;

// The envelope (type, CHB organizationId, Langfuse projectId, regionId) still
// needs a final confirmation from CHB before rollout, so it is isolated here:
// a contract change stays a one-function edit. `type` is repeated here and in
// detail-type so a consumer reading either one sees it.
const buildChbProjectEventPayload = (params: {
  type: ChbProjectEventType;
  chbOrganizationId: string;
  projectId: string;
}) => ({
  type: params.type,
  organizationId: params.chbOrganizationId,
  projectId: params.projectId,
  regionId: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
  createdAt: new Date().toISOString(),
});

// Memoized per bus region so a web instance that never touches CHB billing
// never constructs a client, and one that does reuses its connection pool.
let cachedClient: { region: string; client: EventBridgeClient } | undefined;

const getEventBridgeClient = (region: string): EventBridgeClient => {
  if (cachedClient?.region === region) return cachedClient.client;

  cachedClient = {
    region,
    client: new EventBridgeClient({
      region,
      requestHandler: {
        requestTimeout: EVENT_BUS_REQUEST_TIMEOUT_MS,
        throwOnRequestTimeout: true,
      },
    }),
  };
  return cachedClient.client;
};

/**
 * Publish a single project event to CHB's event bus, retrying over a few
 * seconds. Throws on terminal failure — callers decide whether that is
 * fire-and-forget noise (request path) or worth counting (checkout backfill).
 *
 * Authentication is SigV4 from the task role: infrastructure grants
 * events:PutEvents on exactly this bus ARN, and CHB's side allows our account
 * on the bus resource policy. No shared secret is involved — the CHB service
 * token belongs to their REST API, not here.
 */
export async function sendChbProjectEvent(params: {
  type: ChbProjectEventType;
  chbOrganizationId: string;
  projectId: string;
}): Promise<void> {
  const eventBusArn = env.CLICKHOUSE_BILLING_EVENT_BUS_ARN;
  if (!eventBusArn) {
    throw new Error(
      "CHB event bus is not configured (CLICKHOUSE_BILLING_EVENT_BUS_ARN)",
    );
  }

  // CHB's buses live in their own regions, which do not match ours, and the ARN
  // is the only place that region appears. env.mjs shape-checks the ARN, so the
  // segment is present.
  const region = eventBusArn.split(":")[3];
  const payload = buildChbProjectEventPayload(params);

  await backOff(
    async () => {
      const response = await getEventBridgeClient(region).send(
        new PutEventsCommand({
          Entries: [
            {
              EventBusName: eventBusArn,
              // CHB's bus policy whitelists the allowed event types by
              // detail-type, so the type has to travel here, not only in
              // Detail — otherwise the bus rejects the entry.
              DetailType: params.type,
              Source: CHB_EVENT_SOURCE,
              Detail: JSON.stringify(payload),
            },
          ],
        }),
      );

      // PutEvents answers 200 even when it rejected the entry (bad policy,
      // throttling, malformed detail), so the failure count is the real status.
      if (response.FailedEntryCount) {
        const [entry] = response.Entries ?? [];
        throw new Error(
          `CHB event bus rejected the event: ${entry?.ErrorCode ?? "unknown error"}${
            entry?.ErrorMessage ? ` (${entry.ErrorMessage})` : ""
          }`,
        );
      }
    },
    { numOfAttempts: 3 },
  );
}

/**
 * The CHB organization id to attribute events to, or null when the org has not
 * checked out yet. Every outbound project event goes through this gate: an org
 * without `cloudConfig.clickhouse.organizationId` is not a CHB customer, so
 * there is nothing for CHB to route a project event to.
 */
async function resolveChbOrganizationId(orgId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return null;
  return parseDbOrg(org).cloudConfig?.clickhouse?.organizationId ?? null;
}

/**
 * Fire-and-forget emit for the project create/delete request paths. No-ops
 * unless the org has checked out, and never throws into the caller — project
 * create/delete latency and success are unaffected.
 */
export function emitChbProjectEvent(params: {
  type: ChbProjectEventType;
  orgId: string;
  projectId: string;
}): void {
  (async () => {
    const chbOrganizationId = await resolveChbOrganizationId(params.orgId);
    if (!chbOrganizationId) return;

    await sendChbProjectEvent({
      type: params.type,
      chbOrganizationId,
      projectId: params.projectId,
    });
  })().catch((error) => {
    recordIncrement("langfuse.billing_events.emit_failed", 1, {
      unit: "events",
      source: "request",
    });
    logger.error(
      `[CHB Project Events] Failed to emit ${params.type} for project ${params.projectId} (org ${params.orgId})`,
      error,
    );
  });
}

/**
 * Send LANGFUSE_PROJECT_CREATED for every project the org already has.
 *
 * Checkout calls this right after it persists
 * `cloudConfig.clickhouse.organizationId`, which is the first moment CHB can
 * attribute projects to an organization. Projects created before that point
 * were deliberately never synced, so without this backfill CHB would only ever
 * meter projects created after checkout.
 *
 * Best-effort and never throws: a failed backfill must not fail checkout. One
 * project's delivery failure is isolated so the remaining projects still land,
 * and each failure increments `langfuse.billing_events.emit_failed`
 * (`source:backfill`) so a systematically broken backfill is alertable —
 * silent failure here means CHB under-meters the org indefinitely.
 *
 * Deliveries are sequential: this runs off the request path, and a large org
 * should not burst its whole project list at CHB's event bus at once. A
 * concurrent project create during the backfill can produce a duplicate
 * CREATED, which is harmless — CHB keys projects by id.
 */
export async function backfillChbProjectEvents(params: {
  orgId: string;
}): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  try {
    const chbOrganizationId = await resolveChbOrganizationId(params.orgId);
    if (!chbOrganizationId) return { sent, failed };

    const projects = await prisma.project.findMany({
      where: { orgId: params.orgId, deletedAt: null },
      select: { id: true },
    });

    for (const project of projects) {
      try {
        await sendChbProjectEvent({
          type: "LANGFUSE_PROJECT_CREATED",
          chbOrganizationId,
          projectId: project.id,
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        recordIncrement("langfuse.billing_events.emit_failed", 1, {
          unit: "events",
          source: "backfill",
        });
        logger.error(
          `[CHB Project Events] Failed to backfill LANGFUSE_PROJECT_CREATED for project ${project.id} (org ${params.orgId})`,
          error,
        );
      }
    }

    logger.info(
      `[CHB Project Events] Backfilled ${sent}/${projects.length} projects for org ${params.orgId} (${failed} failed)`,
    );
  } catch (error) {
    // Loading the org or its projects failed — nothing was sent, and checkout
    // still has to succeed.
    recordIncrement("langfuse.billing_events.emit_failed", 1, {
      unit: "events",
      source: "backfill",
    });
    logger.error(
      `[CHB Project Events] Failed to backfill projects for org ${params.orgId}`,
      error,
    );
  }

  return { sent, failed };
}
