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

// EventBridge caps PutEvents at 10 entries per call. Our entries are a few
// hundred bytes each, so the 256KB per-call limit is never the binding one.
const EVENT_BUS_MAX_ENTRIES_PER_CALL = 10;

type CloudCell = NonNullable<typeof env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION>;

// Where each cell runs, mirroring the per-environment AWS region in the
// infrastructure repo. Exhaustive on purpose: a new cell does not compile until
// its location is filled in. DEV is a developer machine with no fixed
// location, so it reports none.
const CELL_LOCATION: Record<
  CloudCell,
  { cloudProvider: "aws"; region: string } | null
> = {
  US: { cloudProvider: "aws", region: "us-west-2" },
  EU: { cloudProvider: "aws", region: "eu-west-1" },
  HIPAA: { cloudProvider: "aws", region: "us-west-2" },
  JP: { cloudProvider: "aws", region: "ap-northeast-1" },
  STAGING: { cloudProvider: "aws", region: "eu-west-1" },
  DEV: null,
};

// The envelope is the contract with CHB, so it is isolated here: a contract
// change stays a one-function edit. `type` is repeated here and in detail-type
// so a consumer reading either one sees it.
const buildChbProjectEventPayload = (params: {
  type: ChbProjectEventType;
  chbOrganizationId: string;
  projectId: string;
}) => {
  const cell = env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION;

  return {
    type: params.type,
    organizationId: params.chbOrganizationId,
    projectId: params.projectId,
    // CHB locates a deployment by provider region plus cell, not by our cell
    // name alone: two cells can share one region (US and HIPAA both run in
    // us-west-2), so the cell is what still tells them apart.
    ...(cell ? CELL_LOCATION[cell] : null),
    cell: cell?.toLowerCase(),
    createdAt: new Date().toISOString(),
  };
};

// One bus per deployment, so one client: the ARN comes from env and cannot
// change at runtime. Lazy so a web instance that never touches CHB billing
// never constructs one, and shared so the rest reuse its connection pool.
let cachedClient: EventBridgeClient | undefined;

const getEventBridgeClient = (region: string): EventBridgeClient => {
  cachedClient ??= new EventBridgeClient({
    region,
    requestHandler: {
      requestTimeout: EVENT_BUS_REQUEST_TIMEOUT_MS,
      throwOnRequestTimeout: true,
    },
  });
  return cachedClient;
};

/**
 * The bus rejected some entries. Carries how many, so the caller can count the
 * events it actually lost instead of assuming the whole batch died.
 */
class ChbEventBusRejection extends Error {
  constructor(
    readonly failedEntryCount: number,
    message: string,
  ) {
    super(message);
    this.name = "ChbEventBusRejection";
  }
}

const requireEventBusArn = (): string => {
  const eventBusArn = env.CLICKHOUSE_BILLING_EVENT_BUS_ARN;
  if (!eventBusArn) {
    throw new Error(
      "CHB event bus is not configured (CLICKHOUSE_BILLING_EVENT_BUS_ARN)",
    );
  }
  return eventBusArn;
};

const buildChbEventEntry = (
  eventBusArn: string,
  params: {
    type: ChbProjectEventType;
    chbOrganizationId: string;
    projectId: string;
  },
) => ({
  EventBusName: eventBusArn,
  // CHB's bus policy whitelists the allowed event types by detail-type, so the
  // type has to travel here, not only in Detail — otherwise the bus rejects
  // the entry.
  DetailType: params.type,
  Source: CHB_EVENT_SOURCE,
  Detail: JSON.stringify(buildChbProjectEventPayload(params)),
});

/**
 * PutEvents one batch of at most `EVENT_BUS_MAX_ENTRIES_PER_CALL` entries,
 * retrying over a few seconds.
 *
 * Retries carry only the entries the bus is still rejecting: PutEvents can fail
 * per entry, and resending a whole batch because one entry was throttled would
 * duplicate the ones that already landed. Throws `ChbEventBusRejection` if
 * anything is still failing after the last attempt, and whatever the SDK threw
 * if the call never completed.
 */
async function putChbEventBatch(
  region: string,
  entries: ReturnType<typeof buildChbEventEntry>[],
): Promise<void> {
  let pending = entries;

  await backOff(
    async () => {
      const response = await getEventBridgeClient(region).send(
        new PutEventsCommand({ Entries: pending }),
      );

      // PutEvents answers 200 even when it rejected entries (bad policy,
      // throttling, malformed detail), so the failure count is the real status.
      if (!response.FailedEntryCount) {
        pending = [];
        return;
      }

      // The response entries are positionally aligned with the request, so an
      // entry with an ErrorCode identifies which input failed.
      const results = response.Entries ?? [];
      const firstError = results.find((result) => result.ErrorCode);
      pending = pending.filter((_, index) => results[index]?.ErrorCode);

      throw new ChbEventBusRejection(
        pending.length,
        `CHB event bus rejected ${pending.length} of ${entries.length} events: ${
          firstError?.ErrorCode ?? "unknown error"
        }${firstError?.ErrorMessage ? ` (${firstError.ErrorMessage})` : ""}`,
      );
    },
    { numOfAttempts: 3 },
  );
}

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
  const eventBusArn = requireEventBusArn();

  // CHB's buses live in their own regions, which do not match ours, and the ARN
  // is the only place that region appears. env.mjs shape-checks the ARN, so the
  // segment is present.
  const region = eventBusArn.split(":")[3];

  await putChbEventBatch(region, [buildChbEventEntry(eventBusArn, params)]);
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
      // A lost create and a lost delete fail differently — the first
      // under-meters an org, the second keeps billing a project that is gone —
      // so they have to be separable on the alert.
      event_type: params.type,
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
 * batch's delivery failure is isolated so the remaining batches still land, and
 * each lost event increments `langfuse.billing_events.emit_failed`
 * (`source:backfill`) so a systematically broken backfill is alertable —
 * silent failure here means CHB under-meters the org indefinitely.
 *
 * Sent in batches of at most ten, which is the PutEvents limit: an org with
 * fifty projects costs five sequential calls rather than fifty. The project
 * query is deliberately unpaginated — Prisma applies no default `take`, so it
 * returns every project, and a cap here would silently under-backfill. Only the
 * ids are selected, so the result stays small even for a very large org.
 *
 * A concurrent project create during the backfill can produce a duplicate
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

    const eventBusArn = requireEventBusArn();
    const region = eventBusArn.split(":")[3];

    const projects = await prisma.project.findMany({
      where: { orgId: params.orgId, deletedAt: null },
      select: { id: true },
    });

    const entries = projects.map((project) =>
      buildChbEventEntry(eventBusArn, {
        type: "LANGFUSE_PROJECT_CREATED",
        chbOrganizationId,
        projectId: project.id,
      }),
    );

    for (
      let offset = 0;
      offset < entries.length;
      offset += EVENT_BUS_MAX_ENTRIES_PER_CALL
    ) {
      const batch = entries.slice(
        offset,
        offset + EVENT_BUS_MAX_ENTRIES_PER_CALL,
      );

      try {
        await putChbEventBatch(region, batch);
        sent += batch.length;
      } catch (error) {
        // A rejection knows exactly how many entries the bus refused; anything
        // else (timeout, transport) means the whole batch is unaccounted for.
        const lost =
          error instanceof ChbEventBusRejection
            ? error.failedEntryCount
            : batch.length;
        sent += batch.length - lost;
        failed += lost;
        recordIncrement("langfuse.billing_events.emit_failed", lost, {
          unit: "events",
          source: "backfill",
          event_type: "LANGFUSE_PROJECT_CREATED",
        });
        logger.error(
          `[CHB Project Events] Failed to backfill ${lost} of ${batch.length} LANGFUSE_PROJECT_CREATED events (org ${params.orgId})`,
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
      event_type: "LANGFUSE_PROJECT_CREATED",
    });
    logger.error(
      `[CHB Project Events] Failed to backfill projects for org ${params.orgId}`,
      error,
    );
  }

  return { sent, failed };
}
