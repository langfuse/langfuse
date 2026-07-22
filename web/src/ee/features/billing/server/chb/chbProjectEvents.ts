import { backOff } from "exponential-backoff";

import { env } from "@/src/env.mjs";
import { parseDbOrg } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  fetchWithSecureRedirects,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";

/**
 * Project lifecycle events for ClickHouse Billing (BIL-5794).
 *
 * CHB needs to know which projects exist per organization to poll our billing
 * metrics API. Delivery is direct best-effort HTTP from web, no queue: CHB's
 * event bus is an always-on managed endpoint; absorbing brief unavailability
 * is CHB's responsibility. At-most-once is acceptable by design — a lost
 * PROJECT_DELETED is benign (the metrics API returns zeros for deleted
 * projects by contract), a lost PROJECT_CREATED delays metering for one
 * project until the `bundle.created` backfill or CHB's backfill pipeline
 * (BIL-6038) catches it. If `langfuse.billing_events.emit_failed` ever shows
 * real loss, swap this helper's internals for a queue — call sites keep the
 * same signature.
 */

export type ChbProjectEventType =
  | "LANGFUSE_PROJECT_CREATED"
  | "LANGFUSE_PROJECT_DELETED";

// TODO(BIL-5794): confirm the exact event envelope with CHB before rollout.
// Field selection follows the spec discussion (type, CHB organizationId,
// Langfuse projectId, regionId); isolated here so a contract change is a
// one-function edit.
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

/**
 * POST a single project event to the CHB event bus, retrying over a few
 * seconds. Throws on terminal failure — callers decide whether that is
 * fire-and-forget noise (request path) or worth surfacing (webhook backfill).
 */
export async function sendChbProjectEvent(params: {
  type: ChbProjectEventType;
  chbOrganizationId: string;
  projectId: string;
}): Promise<void> {
  const eventBusUrl = env.CLICKHOUSE_BILLING_EVENT_BUS_URL;
  const serviceToken = env.CLICKHOUSE_BILLING_SERVICE_TOKEN;
  if (!eventBusUrl || !serviceToken) {
    throw new Error(
      "CHB event bus is not configured (CLICKHOUSE_BILLING_EVENT_BUS_URL / CLICKHOUSE_BILLING_SERVICE_TOKEN)",
    );
  }

  const payload = buildChbProjectEventPayload(params);

  await backOff(
    async () => {
      // The event-bus URL is operator-configured (env), not user input; skip
      // DNS/IP validation but keep manual redirect handling so the bearer
      // token is stripped on any cross-origin redirect.
      const { response } = await fetchWithSecureRedirects(
        eventBusUrl,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${serviceToken}`,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(5_000),
        },
        { maxRedirects: 3, skipValidation: true },
      );
      if (!response.ok) {
        throw new Error(
          `CHB event bus responded with status ${response.status}`,
        );
      }
    },
    { numOfAttempts: 3 },
  );
}

/**
 * Fire-and-forget emit for the project create/delete request paths. Loads the
 * org, no-ops unless it carries CHB state (CHB has nothing to meter
 * otherwise; projects that predate checkout are covered by the
 * `bundle.created` backfill), and never throws into the caller — project
 * create/delete latency and success are unaffected.
 */
export function emitChbProjectEvent(params: {
  type: ChbProjectEventType;
  orgId: string;
  projectId: string;
}): void {
  (async () => {
    const org = await prisma.organization.findUnique({
      where: { id: params.orgId },
    });
    if (!org) return;
    const chbOrganizationId =
      parseDbOrg(org).cloudConfig?.clickhouse?.organizationId;
    if (!chbOrganizationId) return;

    await sendChbProjectEvent({
      type: params.type,
      chbOrganizationId,
      projectId: params.projectId,
    });
  })().catch((error) => {
    recordIncrement("langfuse.billing_events.emit_failed", 1, {
      unit: "events",
    });
    logger.error(
      `[CHB Project Events] Failed to emit ${params.type} for project ${params.projectId} (org ${params.orgId})`,
      error,
    );
  });
}
