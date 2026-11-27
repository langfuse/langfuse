import { isoDateTime } from "@langfuse/shared";
import crypto from "crypto";

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  BILLING_SETTLE_MS,
  type BillableEventType,
  getBillableUnitCountsByProjectInWindow,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";

/**
 * Billing metrics API for ClickHouse Billing (CHB).
 *
 * CHB's metering pipeline polls this endpoint per project (`resourceId`) and
 * time window to derive billable usage. Counts come from the billable_events
 * ledger, so deletes and retention never lower them: a unit counts once in
 * the window when its id did not appear in the 24 hours before the window
 * starts. Response contract: unknown resources return zeros, never 404.
 *
 * Auth: dedicated bearer secret (`CLICKHOUSE_BILLING_METRICS_API_KEY`).
 *
 * Every exit path returns structured `{ message }` JSON, including unexpected
 * failures.
 */

// Reject windows above 24 hours: the ledger read holds every unit of the
// window in memory. CHB polls windows of at most an hour.
const MAX_WINDOW_MS = 24 * 60 * 60 * 1000;

const METRIC_BY_EVENT_TYPE = {
  trace: "traces",
  observation: "observations",
  score: "scores",
  topic_facet_summary: "topicFacetSummaries",
} as const satisfies Record<BillableEventType, string>;

const MetricsQuerySchema = z.object({
  startTime: isoDateTime({ offset: true }),
  endTime: isoDateTime({ offset: true }),
  resourceId: z.string().min(1),
});

const metricsForProject = (
  rows: { projectId: string; eventType: BillableEventType; count: number }[],
  projectId: string,
) => {
  const metrics = {
    traces: { sum: 0 },
    observations: { sum: 0 },
    scores: { sum: 0 },
    topicFacetSummaries: { sum: 0 },
  };
  for (const row of rows) {
    if (row.projectId !== projectId) continue;
    metrics[METRIC_BY_EVENT_TYPE[row.eventType]].sum += row.count;
  }
  return metrics;
};

const isAuthorized = (req: NextRequest, apiKey: string): boolean => {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  try {
    // timingSafeEqual throws on different input lengths, handle accordingly
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(apiKey));
  } catch {
    return false;
  }
};

export async function chbMetricsApiHandler(req: NextRequest) {
  if (!env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION) {
    logger.error("[CHB Metrics API] Endpoint only available in Langfuse Cloud");
    return NextResponse.json(
      { message: "Billing metrics endpoint only available in Langfuse Cloud" },
      { status: 500 },
    );
  }
  if (!env.CLICKHOUSE_BILLING_METRICS_API_KEY) {
    logger.error(
      "[CHB Metrics API] CLICKHOUSE_BILLING_METRICS_API_KEY is not configured",
    );
    return NextResponse.json(
      { message: "Billing metrics endpoint is not configured" },
      { status: 500 },
    );
  }

  if (!isAuthorized(req, env.CLICKHOUSE_BILLING_METRICS_API_KEY)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const parsedQuery = MetricsQuerySchema.safeParse({
    startTime: req.nextUrl.searchParams.get("startTime") ?? undefined,
    endTime: req.nextUrl.searchParams.get("endTime") ?? undefined,
    resourceId: req.nextUrl.searchParams.get("resourceId") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      {
        message: "Invalid query parameters",
        issues: parsedQuery.error.issues,
      },
      { status: 400 },
    );
  }

  const { resourceId } = parsedQuery.data;
  const start = new Date(parsedQuery.data.startTime);
  const end = new Date(parsedQuery.data.endTime);

  if (end.getTime() <= start.getTime()) {
    return NextResponse.json(
      { message: "endTime must be after startTime" },
      { status: 400 },
    );
  }
  if (end.getTime() - start.getTime() > MAX_WINDOW_MS) {
    return NextResponse.json(
      { message: "Requested window exceeds the 24 hour maximum" },
      { status: 400 },
    );
  }
  const now = Date.now();
  if (end.getTime() > now) {
    return NextResponse.json(
      { message: "endTime must not be in the future" },
      { status: 400 },
    );
  }
  // Rows stamped just before endTime can take a moment to become readable.
  // That is a state of our ingestion, not a client error: answering now would
  // under-bill the window for good, so ask CHB to retry once it has settled.
  const settlesAt = end.getTime() + BILLING_SETTLE_MS;
  if (settlesAt > now) {
    recordIncrement("langfuse.billing_metrics.unsettled_window", 1, {
      unit: "requests",
    });
    return NextResponse.json(
      { message: "Requested window has not settled yet, retry later" },
      {
        status: 503,
        headers: {
          "Retry-After": String(Math.ceil((settlesAt - now) / 1000)),
        },
      },
    );
  }

  try {
    // Telemetry-only lookup: a resourceId unknown to this region still returns
    // zeros per contract, but zeros can mask a misconfigured/misrouted CHB
    // poller — surface a signal without changing the response. Soft-deleted
    // projects still have a Postgres row and are intentionally not counted as
    // unknown.
    const project = await prisma.project.findUnique({
      where: { id: resourceId },
      select: { id: true },
    });
    if (!project) {
      recordIncrement("langfuse.billing_metrics.unknown_resource", 1, {
        unit: "requests",
      });
      logger.info(
        `[CHB Metrics API] resourceId ${resourceId} is unknown to this region, returning zeros`,
      );
    }

    const counts = await getBillableUnitCountsByProjectInWindow({
      windowFrom: start,
      windowTo: end,
      projectId: resourceId,
    });

    return NextResponse.json(
      { metrics: metricsForProject(counts, resourceId) },
      { status: 200 },
    );
  } catch (err) {
    // A ClickHouse or Postgres blip must not turn into a zero-valued 200: CHB
    // would meter the org for nothing. Fail loud with a retryable 5xx.
    logger.error("[CHB Metrics API] Failed to resolve usage metrics", err);
    return NextResponse.json(
      { message: "Failed to resolve usage metrics" },
      { status: 500 },
    );
  }
}
