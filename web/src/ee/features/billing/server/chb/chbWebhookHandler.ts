import crypto from "crypto";

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/src/env.mjs";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  type ChbPlanCode,
  chbPlanCodeToPlan,
  CloudConfigSchema,
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

import { createDefaultSpendAlertsForPlan } from "../stripe/stripeWebhookHandler";
import { ChbScheduledChangeSchema } from "./chbApiClient";
import { sendChbProjectEvent } from "./chbProjectEvents";

/**
 * ClickHouse Billing webhook handler — structural twin of
 * stripeWebhookHandler. CHB is the source of truth for bundle state; this
 * handler is the single writer of `cloudConfig.clickhouse` (plus the
 * checkout-session write of `organizationId`).
 *
 * Pipeline: verify HMAC → dedupe → resolve org (region fan-out) → ordering
 * guard → per-event effect → invalidateCachedOrgApiKeys + auditLog.
 */

const CHB_SIGNATURE_HEADER = "x-chb-signature";
const MAX_CLOCK_SKEW_SECONDS = 5 * 60;
const DEDUPE_TTL_SECONDS = 24 * 60 * 60;

// Envelope as the ClickHouse control plane's signed-webhook dispatcher emits
// it: `{eventId, type, occurredAt, data}`, where `data` is the bundle payload
// and names the owning ClickHouse organization. The body is signed as-is, so
// this schema only ever sees bytes that already passed verification. `data`
// stays permissive about unknown fields so CHB can extend the payload without
// a deploy here.
export const ChbWebhookEventSchema = z.object({
  eventId: z.string().min(1),
  type: z.string(),
  occurredAt: z.iso.datetime({ offset: true }),
  data: z.object({
    // ClickHouse Organization ID owning the bundle
    organizationId: z.uuid(),
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
  }),
});
export type ChbWebhookEvent = z.infer<typeof ChbWebhookEventSchema>;

/**
 * `X-CHB-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>...]`, as emitted by
 * the control plane's signed-webhook dispatcher. The timestamp stays a string
 * because it is signed byte for byte. Several `v1` values appear while CHB
 * rotates its signing key: the dispatcher signs with every key it holds, and a
 * receiver accepts the request if any of them matches the key it holds.
 */
export function parseChbSignatureHeader(
  header: string,
): { timestamp: string; signatures: string[] } | null {
  let timestamp: string | undefined;
  const signatures: string[] = [];

  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator);
    const value = part.slice(separator + 1);
    if (key === "t") timestamp = value;
    else if (key === "v1") signatures.push(value);
  }

  if (timestamp === undefined || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/** Constant-time compare of two hex digests. `timingSafeEqual` throws on a
 * length mismatch and the candidate is attacker-controlled; the length is not
 * secret, so checking it first is fine. */
function digestsMatch(expectedHex: string, candidateHex: string): boolean {
  const expected = Buffer.from(expectedHex, "hex");
  const candidate = Buffer.from(candidateHex, "hex");
  return (
    expected.length === candidate.length &&
    crypto.timingSafeEqual(expected, candidate)
  );
}

/**
 * Verify the CHB webhook signature: HMAC-SHA256 over `${t}.${rawBody}`, hex
 * encoded, compared in constant time, with a ±5 minute skew window on `t`.
 * The dispatcher re-signs on every delivery attempt, so the short window stays
 * compatible with its multi-day retry budget. One local secret is enough for a
 * rotation: while CHB signs with both keys, any `v1` matching ours passes.
 */
export function verifyChbSignature(params: {
  rawBody: string | Buffer;
  signatureHeader: string | null;
  secret: string;
  nowMs?: number;
}): { valid: boolean; reason?: string } {
  const { rawBody, signatureHeader, secret } = params;
  if (signatureHeader === null) {
    return { valid: false, reason: "missing signature header" };
  }
  const parsed = parseChbSignatureHeader(signatureHeader);
  if (!parsed) {
    return { valid: false, reason: "malformed signature header" };
  }
  if (!/^\d+$/.test(parsed.timestamp)) {
    return { valid: false, reason: "malformed timestamp" };
  }

  const nowSeconds = Math.floor((params.nowMs ?? Date.now()) / 1000);
  if (
    Math.abs(nowSeconds - Number(parsed.timestamp)) > MAX_CLOCK_SKEW_SECONDS
  ) {
    return { valid: false, reason: "timestamp outside allowed clock skew" };
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parsed.timestamp}.`)
    .update(rawBody)
    .digest("hex");
  const matches = parsed.signatures.some((candidate) =>
    digestsMatch(expected, candidate),
  );
  return matches
    ? { valid: true }
    : { valid: false, reason: "signature mismatch" };
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

const dedupeKey = (eventId: string) => `chb-webhook-event:${eventId}`;

/** Best-effort Redis dedupe; every handler is also idempotent, so a Redis
 * flush cannot corrupt state. Returns true when the event was seen before.
 *
 * Claiming the id is the same operation as checking it, so a claim that is not
 * followed by a successful apply has to be released — see releaseEventClaim. */
async function isDuplicateEvent(eventId: string): Promise<boolean> {
  try {
    const result = await redis?.set(
      dedupeKey(eventId),
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

/**
 * Drop the dedupe claim for an event that failed to apply. Without this, the
 * 500 we return sends CHB into a retry that its own claim now suppresses as a
 * duplicate, and the event is lost for the whole 24h TTL — long after CHB has
 * stopped retrying. Losing one means a missing cloudConfig.clickhouse block, a
 * still-suspended paying org, or an unmetered project, all needing manual
 * reconciliation.
 */
async function releaseEventClaim(eventId: string): Promise<void> {
  try {
    await redis?.del(dedupeKey(eventId));
  } catch (error) {
    // Nothing better to do than page: the event is now un-retryable.
    logger.error(
      `[CHB Webhook] Failed to release the dedupe claim for event ${eventId}; a CHB retry will be dropped as a duplicate`,
      error,
    );
    traceException(error);
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

  // The bytes as received: the signature covers the body exactly as CHB
  // serialized it, so nothing may decode or re-encode it before verification.
  const rawBody = Buffer.from(await req.arrayBuffer());
  const verification = verifyChbSignature({
    rawBody,
    signatureHeader: req.headers.get(CHB_SIGNATURE_HEADER),
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
    event = ChbWebhookEventSchema.parse(JSON.parse(rawBody.toString("utf8")));
  } catch (error) {
    logger.error("[CHB Webhook] Failed to parse event payload", error);
    return NextResponse.json(
      { message: "Webhook error: invalid payload" },
      { status: 400 },
    );
  }

  logger.info(`[CHB Webhook] Start ${event.type}`, { payload: event });

  if (await isDuplicateEvent(event.eventId)) {
    logger.info(
      `[CHB Webhook] Duplicate event ${event.eventId} (${event.type}), skipping`,
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Region fan-out: CHB pings all Langfuse regions; exactly one owns the org.
  const parsedOrg = await getOrgByChbOrganizationId(event.data.organizationId);
  if (!parsedOrg) {
    logger.info(
      `[CHB Webhook] No org for CHB organization ${event.data.organizationId} in this region, ignoring`,
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Interlock (must never happen): an org bills through exactly one provider.
  // Checking getBillingProvider here would be dead code -- it returns
  // "clickhouse" for anything carrying a clickhouse.organizationId, which is
  // precisely how this org was just resolved. The state that actually needs
  // catching is the contradiction: a live Stripe subscription alongside CHB
  // state means the customer is being billed twice, and applying more CHB state
  // would bury that. Refuse and page instead; a retry cannot fix it.
  if (parsedOrg.cloudConfig?.stripe?.activeSubscriptionId) {
    const message = `[CHB Webhook] Org ${parsedOrg.id} carries an active Stripe subscription alongside CHB state, refusing to apply ${event.type}`;
    logger.error(message);
    traceException(message);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Ordering guard: drop events at or before the last applied one (protects
  // against retries and out-of-order delivery).
  const lastEventCreatedAt =
    parsedOrg.cloudConfig?.clickhouse?.lastEventCreatedAt;
  if (
    lastEventCreatedAt &&
    Date.parse(event.occurredAt) <= Date.parse(lastEventCreatedAt)
  ) {
    logger.info(
      `[CHB Webhook] Out-of-order event ${event.eventId} (${event.type}) for org ${parsedOrg.id}, skipping`,
      { occurredAt: event.occurredAt, lastEventCreatedAt },
    );
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
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
  } catch (error) {
    // The dedupe claim was taken before dispatch, so it has to go back before we
    // ask CHB to retry -- otherwise the retry is dropped as a duplicate and the
    // event is lost for good.
    await releaseEventClaim(event.eventId);
    logger.error(
      `[CHB Webhook] Failed to apply ${event.type} (${event.eventId}) for org ${parsedOrg.id}`,
      error,
    );
    traceException(error);
    return NextResponse.json(
      { message: "Failed to apply webhook event" },
      { status: 500 },
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

/**
 * Persist a new clickhouse block + org columns, then propagate: the resolved
 * plan and suspension flag are baked into the Redis-cached API-key record, so
 * every write ends with a cache invalidation.
 *
 * The organization update is the commit point. It persists this event's
 * occurredAt as lastEventCreatedAt, after which the ordering guard drops any
 * retry of the same event as already applied. Nothing that runs after it may
 * fail the request: a 500 would ask CHB for a retry that can never reach that
 * code again. Post-commit steps -- here and in the per-event handlers -- are
 * best-effort: log, page, and let the request succeed.
 */
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

  // Post-commit. Bounded: a stale cached plan expires with the API-key cache
  // TTL.
  try {
    await invalidateCachedOrgApiKeys(parsedOrg.id);
  } catch (error) {
    logger.error(
      `[CHB Webhook] Failed to invalidate cached API keys for org ${parsedOrg.id} after applying ${event.type}`,
      error,
    );
    traceException(error);
  }

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

  // Same gate as bundle.updated and the Stripe path: only clear the free-tier
  // suspension once payment is credibly current. A bundle whose initial payment
  // is pending or failed must not un-block ingestion for an org that was
  // suspended at the free-tier limit -- bundle.updated lifts it when the payment
  // goes active.
  const isPaidAndCurrent = data.payment?.status === "active";

  await persistAndPropagate({
    parsedOrg,
    event,
    // Fresh block: a re-subscription must not inherit scheduled state from a
    // previously cancelled bundle.
    clickhouse: {
      organizationId: event.data.organizationId,
      bundleId: data.bundleId,
      planCode: data.planCode,
      paymentStatus: data.payment?.status,
      nextPaymentDate: data.nextPaymentDate,
      stripeCustomerId:
        data.payment?.provider?.customerId ?? existing?.stripeCustomerId,
      lastEventCreatedAt: event.occurredAt,
    },
    orgColumns: {
      // First paid subscription anchors the billing cycle on the bundle start
      cloudBillingCycleAnchor: data.startDate
        ? new Date(data.startDate)
        : startOfDayUTC(new Date()),
      ...(isPaidAndCurrent ? { cloudFreeTierUsageThresholdState: null } : {}),
    },
  });

  // Default spend alerts, same thresholds as the Stripe path (best-effort).
  // The shared map is total over known codes, so an unknown one (CHB shipping a
  // tier before we deploy support for it) resolves to undefined rather than
  // seeding alerts for the wrong plan.
  const plan = data.planCode
    ? chbPlanCodeToPlan[data.planCode as ChbPlanCode]
    : undefined;
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

  // Backfill-emit LANGFUSE_PROJECT_CREATED for all existing projects: projects
  // created before checkout would otherwise be invisible to CHB metering.
  // Post-commit and best-effort -- CHB's own backfill pipeline is the backstop.
  try {
    await backfillProjectEvents(parsedOrg, event.data.organizationId);
  } catch (error) {
    logger.error(
      `[CHB Webhook] Project backfill failed for org ${parsedOrg.id}`,
      error,
    );
    traceException(error);
  }
}

async function backfillProjectEvents(
  parsedOrg: ParsedOrganization,
  chbOrganizationId: string,
) {
  const projects = await prisma.project.findMany({
    where: { orgId: parsedOrg.id, deletedAt: null },
    select: { id: true },
  });
  const results = await Promise.allSettled(
    projects.map((project) =>
      sendChbProjectEvent({
        type: "LANGFUSE_PROJECT_CREATED",
        chbOrganizationId,
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
      organizationId: event.data.organizationId,
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
      lastEventCreatedAt: event.occurredAt,
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
  // never execute scheduled changes locally on a timer: CHB owns the terminal
  // event, and a local timer would race it.
  await persistAndPropagate({
    parsedOrg,
    event,
    clickhouse: {
      ...existing,
      organizationId: event.data.organizationId,
      scheduled: event.data.scheduled ?? null,
      lastEventCreatedAt: event.occurredAt,
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
    // Keep organizationId (the customer and CH org survive cancellation) and
    // stripeCustomerId (support tooling); drop the bundle so the org resolves
    // back to cloud:hobby — same semantics as Stripe subscription.deleted.
    clickhouse: {
      organizationId: event.data.organizationId,
      stripeCustomerId: existing?.stripeCustomerId,
      lastEventCreatedAt: event.occurredAt,
    },
    orgColumns: {
      // Reset billing cycle anchor on downgrade to hobby to start of today
      cloudBillingCycleAnchor: startOfDayUTC(new Date()),
    },
  });
}
