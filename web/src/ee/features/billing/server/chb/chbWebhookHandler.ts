import crypto from "crypto";

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/src/env.mjs";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  CloudConfigSchema,
  getBillingProvider,
  parseDbOrg,
  type ParsedOrganization,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  invalidateCachedOrgApiKeys,
  logger,
  recordIncrement,
  redis,
  startOfDayUTC,
  traceException,
} from "@langfuse/shared/src/server";

import { mapChbPlanCodeToPlan } from "../../utils/chbCatalogue";
import { createDefaultSpendAlertsForPlan } from "../stripe/stripeWebhookHandler";
import { ChbScheduledChangeSchema } from "./chbApiClient";
import { sendChbProjectEvent } from "./chbProjectEvents";

/**
 * ClickHouse Billing webhook handler (BIL-5791 §2.2) — structural twin of
 * stripeWebhookHandler. CHB is the source of truth for bundle state; this
 * handler is the single writer of `cloudConfig.clickhouse` (plus the
 * checkout-session write of `organizationId`).
 *
 * Pipeline: verify HMAC → dedupe → resolve org (region fan-out) → ordering
 * guard → per-event effect → invalidateCachedOrgApiKeys + auditLog.
 */

const CHB_SIGNATURE_HEADER = "chb-signature";
const CHB_TIMESTAMP_HEADER = "chb-timestamp";
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const DEDUPE_TTL_SECONDS = 24 * 60 * 60;

// TODO(BIL-5791): the event envelope below follows the spec discussion but
// must be reconciled against the final CHB webhook definition before rollout.
export const ChbWebhookEventSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  createdAt: z.iso.datetime({ offset: true }),
  // ClickHouse Organization ID owning the bundle
  organizationId: z.uuid(),
  data: z
    .object({
      bundleId: z.string().nullish(),
      planCode: z.string().nullish(),
      startDate: z.string().nullish(),
      nextPaymentDate: z.string().nullish(),
      payment: z
        .object({
          status: z.string().nullish(),
          provider: z
            .object({
              customerId: z.string().nullish(),
            })
            .nullish(),
        })
        .nullish(),
      scheduled: ChbScheduledChangeSchema.nullish(),
    })
    .default({}),
});
export type ChbWebhookEvent = z.infer<typeof ChbWebhookEventSchema>;

/**
 * Verify the CHB webhook signature: HMAC-SHA256 over
 * `${timestamp}.${rawBody}`, hex-encoded, constant-time compare, and a ±5
 * minute clock-skew window on the unix-seconds timestamp.
 *
 * The exact header/format is pending CHB's security review (BIL-5791 open
 * thread) — isolated here so the final scheme is a one-function change.
 */
export function verifyChbSignature(params: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  nowMs?: number;
}): { valid: boolean; reason?: string } {
  const { rawBody, signature, timestamp, secret } = params;
  if (!signature || !timestamp) {
    return { valid: false, reason: "missing signature or timestamp header" };
  }
  if (!/^\d+$/.test(timestamp)) {
    return { valid: false, reason: "malformed timestamp" };
  }

  const nowSeconds = Math.floor((params.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) {
    return { valid: false, reason: "timestamp outside allowed clock skew" };
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  try {
    // timingSafeEqual throws on different input lengths, handle accordingly
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature, "utf8"),
        Buffer.from(expected, "utf8"),
      )
    ) {
      return { valid: false, reason: "signature mismatch" };
    }
  } catch {
    return { valid: false, reason: "signature mismatch" };
  }

  return { valid: true };
}

async function getOrgByChbOrganizationId(
  chbOrganizationId: string,
): Promise<ParsedOrganization | null> {
  const org = await prisma.organization.findFirst({
    where: {
      cloudConfig: {
        path: ["clickhouse", "organizationId"],
        equals: chbOrganizationId,
      },
    },
  });
  return org ? parseDbOrg(org) : null;
}

/** Best-effort Redis dedupe; every handler is also idempotent, so a Redis
 * flush cannot corrupt state. Returns true when the event was seen before. */
async function isDuplicateEvent(eventId: string): Promise<boolean> {
  try {
    const result = await redis?.set(
      `chb-webhook-event:${eventId}`,
      "1",
      "EX",
      DEDUPE_TTL_SECONDS,
      "NX",
    );
    // ioredis returns null when NX prevented the write → key existed
    return redis ? result === null : false;
  } catch (error) {
    logger.warn("[CHB Webhook] Redis dedupe check failed, processing event", {
      eventId,
      error,
    });
    return false;
  }
}

export async function chbWebhookHandler(req: NextRequest) {
  if (req.method !== "POST") {
    return NextResponse.json(
      { message: "Method not allowed" },
      { status: 405 },
    );
  }

  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    logger.error("[CHB Webhook] Endpoint only available in Langfuse Cloud");
    return NextResponse.json(
      { message: "CHB webhook endpoint only available in Langfuse Cloud" },
      { status: 500 },
    );
  }
  if (!env.CLICKHOUSE_BILLING_WEBHOOK_SIGNING_SECRET) {
    logger.error(
      "[CHB Webhook] CLICKHOUSE_BILLING_WEBHOOK_SIGNING_SECRET is not configured",
    );
    return NextResponse.json(
      { message: "CHB webhook signing secret not found" },
      { status: 500 },
    );
  }

  const rawBody = await req.text();
  const verification = verifyChbSignature({
    rawBody,
    signature: req.headers.get(CHB_SIGNATURE_HEADER),
    timestamp: req.headers.get(CHB_TIMESTAMP_HEADER),
    secret: env.CLICKHOUSE_BILLING_WEBHOOK_SIGNING_SECRET,
  });
  if (!verification.valid) {
    logger.error(
      `[CHB Webhook] Signature verification failed: ${verification.reason}`,
    );
    return NextResponse.json(
      { message: `Webhook error: ${verification.reason}` },
      { status: 400 },
    );
  }

  let event: ChbWebhookEvent;
  try {
    event = ChbWebhookEventSchema.parse(JSON.parse(rawBody));
  } catch (error) {
    logger.error("[CHB Webhook] Failed to parse event payload", error);
    return NextResponse.json(
      { message: "Webhook error: invalid payload" },
      { status: 400 },
    );
  }

  logger.info(`[CHB Webhook] Start ${event.type}`, { payload: event });

  if (await isDuplicateEvent(event.id)) {
    logger.info(
      `[CHB Webhook] Duplicate event ${event.id} (${event.type}), skipping`,
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Region fan-out: CHB pings all Langfuse regions; exactly one owns the org.
  const parsedOrg = await getOrgByChbOrganizationId(event.organizationId);
  if (!parsedOrg) {
    logger.info(
      `[CHB Webhook] No org for CHB organization ${event.organizationId} in this region, ignoring`,
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Interlock (must never happen): never write CHB state onto a Stripe org.
  if (getBillingProvider(parsedOrg) === "stripe") {
    logger.error(
      `[CHB Webhook] Org ${parsedOrg.id} resolves to the Stripe provider, refusing to apply ${event.type}`,
    );
    traceException(
      `[CHB Webhook] Org ${parsedOrg.id} resolves to the Stripe provider, refusing to apply ${event.type}`,
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Ordering guard: drop events at or before the last applied one (protects
  // against retries and out-of-order delivery).
  const lastEventCreatedAt =
    parsedOrg.cloudConfig?.clickhouse?.lastEventCreatedAt;
  if (
    lastEventCreatedAt &&
    Date.parse(event.createdAt) <= Date.parse(lastEventCreatedAt)
  ) {
    logger.info(
      `[CHB Webhook] Out-of-order event ${event.id} (${event.type}) for org ${parsedOrg.id}, skipping`,
      { eventCreatedAt: event.createdAt, lastEventCreatedAt },
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  switch (event.type) {
    case "bundle.created":
      await handleBundleCreated(parsedOrg, event);
      break;
    case "bundle.updated":
      await handleBundleUpdated(parsedOrg, event);
      break;
    case "bundle.scheduled":
      await handleBundleScheduled(parsedOrg, event);
      break;
    case "bundle.cancelled":
      await handleBundleCancelled(parsedOrg, event);
      break;
    default:
      logger.warn(`[CHB Webhook] Unhandled event type ${event.type}`);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

/** Persist a new clickhouse block + org columns, then propagate: the
 * resolved plan and suspension flag are baked into the Redis-cached API-key
 * record, so every write ends with a cache invalidation. */
async function persistAndPropagate(params: {
  parsedOrg: ParsedOrganization;
  event: ChbWebhookEvent;
  clickhouse: unknown;
  orgColumns?: {
    cloudBillingCycleAnchor?: Date;
    cloudFreeTierUsageThresholdState?: null;
  };
}) {
  const { parsedOrg, event } = params;

  // Validate through the stored schema so a bad write can never poison
  // parseDbOrg for the whole cloudConfig.
  const updatedCloudConfig = {
    ...parsedOrg.cloudConfig,
    clickhouse: CloudConfigSchema.shape.clickhouse.parse(params.clickhouse),
  };

  await prisma.organization.update({
    where: { id: parsedOrg.id },
    data: {
      cloudConfig: updatedCloudConfig,
      ...(params.orgColumns ?? {}),
    },
  });

  await invalidateCachedOrgApiKeys(parsedOrg.id);

  auditLog({
    session: {
      user: { id: "clickhouse-webhook" },
      orgId: parsedOrg.id,
    },
    orgId: parsedOrg.id,
    resourceType: "organization",
    resourceId: parsedOrg.id,
    action: `BillingService.chb.${event.type}`,
    before: parsedOrg.cloudConfig,
    after: updatedCloudConfig,
  });

  return updatedCloudConfig;
}

async function handleBundleCreated(
  parsedOrg: ParsedOrganization,
  event: ChbWebhookEvent,
) {
  const { data } = event;
  const existing = parsedOrg.cloudConfig?.clickhouse;

  if (!data.bundleId) {
    logger.error(
      `[CHB Webhook] bundle.created without bundleId for org ${parsedOrg.id}, skipping`,
    );
    traceException(
      `[CHB Webhook] bundle.created without bundleId for org ${parsedOrg.id}`,
    );
    return;
  }

  await persistAndPropagate({
    parsedOrg,
    event,
    // Fresh block: a re-subscription must not inherit scheduled state from a
    // previously cancelled bundle.
    clickhouse: {
      organizationId: event.organizationId,
      bundleId: data.bundleId,
      planCode: data.planCode,
      paymentStatus: data.payment?.status,
      nextPaymentDate: data.nextPaymentDate,
      stripeCustomerId:
        data.payment?.provider?.customerId ?? existing?.stripeCustomerId,
      lastEventCreatedAt: event.createdAt,
    },
    orgColumns: {
      // First paid subscription anchors the billing cycle on the bundle start
      cloudBillingCycleAnchor: data.startDate
        ? new Date(data.startDate)
        : startOfDayUTC(new Date()),
      // Un-suspend: the org is now a paying customer
      cloudFreeTierUsageThresholdState: null,
    },
  });

  // Default spend alerts, same thresholds as the Stripe path (best-effort)
  const plan = data.planCode ? mapChbPlanCodeToPlan(data.planCode) : null;
  if (plan) {
    try {
      await createDefaultSpendAlertsForPlan({
        orgId: parsedOrg.id,
        plan,
        actor: "clickhouse-webhook",
        logPrefix: "[CHB Webhook]",
      });
    } catch (error) {
      logger.error("[CHB Webhook] Failed to create default spend alerts", {
        orgId: parsedOrg.id,
        error,
      });
      traceException(error);
    }
  } else {
    logger.error(
      `[CHB Webhook] bundle.created with unknown plan code ${data.planCode} for org ${parsedOrg.id}, skipping spend alert seeding`,
    );
  }

  // Backfill-emit LANGFUSE_PROJECT_CREATED for all existing projects:
  // projects created before checkout would otherwise be invisible to CHB
  // metering. Best-effort — CHB's backfill pipeline (BIL-6038) is the
  // backstop.
  const projects = await prisma.project.findMany({
    where: { orgId: parsedOrg.id, deletedAt: null },
    select: { id: true },
  });
  const results = await Promise.allSettled(
    projects.map((project) =>
      sendChbProjectEvent({
        type: "LANGFUSE_PROJECT_CREATED",
        chbOrganizationId: event.organizationId,
        projectId: project.id,
      }),
    ),
  );
  const failed = results.filter((result) => result.status === "rejected");
  if (failed.length > 0) {
    recordIncrement("langfuse.billing_events.emit_failed", failed.length, {
      unit: "events",
    });
    logger.error(
      `[CHB Webhook] Project backfill emit failed for ${failed.length}/${projects.length} projects of org ${parsedOrg.id}`,
    );
  }
}

async function handleBundleUpdated(
  parsedOrg: ParsedOrganization,
  event: ChbWebhookEvent,
) {
  const { data } = event;
  const existing = parsedOrg.cloudConfig?.clickhouse;

  if (!existing?.bundleId && !data.bundleId) {
    logger.error(
      `[CHB Webhook] bundle.updated for org ${parsedOrg.id} without any bundle id, skipping`,
    );
    return;
  }

  // Mirror of the Stripe active|trialing logic: only clear the free-tier
  // suspension when payment is credibly current.
  const isPaidAndCurrent = data.payment?.status === "active";

  await persistAndPropagate({
    parsedOrg,
    event,
    // Merge semantics: absent fields keep their stored value; explicit null
    // clears (e.g. scheduled: null after a scheduled change executed).
    clickhouse: {
      ...existing,
      organizationId: event.organizationId,
      ...(data.bundleId !== undefined ? { bundleId: data.bundleId } : {}),
      ...(data.planCode !== undefined ? { planCode: data.planCode } : {}),
      ...(data.payment?.status !== undefined
        ? { paymentStatus: data.payment.status }
        : {}),
      ...(data.nextPaymentDate !== undefined
        ? { nextPaymentDate: data.nextPaymentDate }
        : {}),
      ...(data.payment?.provider?.customerId
        ? { stripeCustomerId: data.payment.provider.customerId }
        : {}),
      ...(data.scheduled !== undefined ? { scheduled: data.scheduled } : {}),
      lastEventCreatedAt: event.createdAt,
    },
    orgColumns: isPaidAndCurrent
      ? { cloudFreeTierUsageThresholdState: null }
      : undefined,
  });
}

async function handleBundleScheduled(
  parsedOrg: ParsedOrganization,
  event: ChbWebhookEvent,
) {
  const existing = parsedOrg.cloudConfig?.clickhouse;

  // Snapshot only — no plan change. The UI renders the pending-change banner
  // from it; the plan flips when bundle.updated / bundle.cancelled lands. We
  // never execute scheduled changes locally on a timer (open spec thread on
  // the terminal event, plan §8.1).
  await persistAndPropagate({
    parsedOrg,
    event,
    clickhouse: {
      ...existing,
      organizationId: event.organizationId,
      scheduled: event.data.scheduled ?? null,
      lastEventCreatedAt: event.createdAt,
    },
  });
}

async function handleBundleCancelled(
  parsedOrg: ParsedOrganization,
  event: ChbWebhookEvent,
) {
  const existing = parsedOrg.cloudConfig?.clickhouse;

  await persistAndPropagate({
    parsedOrg,
    event,
    // Keep organizationId (spec: customer + CH org survive cancellation) and
    // stripeCustomerId (support tooling); drop the bundle so the org
    // resolves back to cloud:hobby — same semantics as Stripe
    // subscription.deleted.
    clickhouse: {
      organizationId: event.organizationId,
      stripeCustomerId: existing?.stripeCustomerId,
      lastEventCreatedAt: event.createdAt,
    },
    orgColumns: {
      // Reset billing cycle anchor on downgrade to hobby to start of today
      cloudBillingCycleAnchor: startOfDayUTC(new Date()),
    },
  });
}
