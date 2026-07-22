import crypto from "crypto";

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/src/env.mjs";
import { prisma } from "@langfuse/shared/src/db";
import {
  getObservationCountsByProjectInCreationInterval,
  getScoreCountsByProjectInCreationInterval,
  getTraceCountsByProjectInCreationInterval,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";

/**
 * Billing metrics API for ClickHouse Billing (BIL-5794).
 *
 * CHB's metering pipeline polls this endpoint per project (`resourceId`) and
 * short trailing time window to derive billable usage. Response contract:
 * unknown resources return zeros, never 404 — a `resourceId` that never
 * existed, is already deleted, or is homed in another region yields
 * `traces/scores/observations = 0` with status 200 (requirement added on
 * BIL-5794, 2026-07-16, matching other ClickHouse products' metering).
 *
 * Auth: dedicated bearer secret (`CLICKHOUSE_BILLING_METRICS_API_KEY`).
 * The ADMIN_API_KEY mechanism is deliberately not reused — it is hard-blocked
 * on Langfuse Cloud, which is exactly where this endpoint must run.
 */

// Reject windows above 35 days: keeps a misbehaving caller from issuing
// full-history created_at scans (these have hit the ClickHouse request
// ceiling in production before); CHB polls short trailing windows.
const MAX_WINDOW_MS = 35 * 24 * 60 * 60 * 1000;

const MetricsQuerySchema = z.object({
  startTime: z.iso.datetime({ offset: true }),
  endTime: z.iso.datetime({ offset: true }),
  resourceId: z.string().min(1),
});

const sumForProject = (
  rows: { projectId: string; count: number }[],
  projectId: string,
): number =>
  rows
    .filter((row) => row.projectId === projectId)
    .reduce((sum, row) => sum + row.count, 0);

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
      { message: "Requested window exceeds the 35 day maximum" },
      { status: 400 },
    );
  }

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
    logger.debug(
      `[CHB Metrics API] resourceId ${resourceId} is unknown to this region, returning zeros`,
    );
  }

  const [traceCounts, observationCounts, scoreCounts] = await Promise.all([
    getTraceCountsByProjectInCreationInterval({
      start,
      end,
      projectId: resourceId,
    }),
    getObservationCountsByProjectInCreationInterval({
      start,
      end,
      projectId: resourceId,
    }),
    getScoreCountsByProjectInCreationInterval({
      start,
      end,
      projectId: resourceId,
    }),
  ]);

  return NextResponse.json(
    {
      metrics: {
        traces: { sum: sumForProject(traceCounts, resourceId) },
        observations: { sum: sumForProject(observationCounts, resourceId) },
        scores: { sum: sumForProject(scoreCounts, resourceId) },
      },
    },
    { status: 200 },
  );
}
