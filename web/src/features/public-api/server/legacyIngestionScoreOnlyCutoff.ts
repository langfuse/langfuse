import {
  eventTypes,
  extractPublicApiCallerAttribution,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";

const LEGACY_INGESTION_OTLP_TRACES = "POST /api/public/otel/v1/traces";
const LEGACY_INGESTION_SCORES = "POST /api/public/scores";
const LEGACY_INGESTION_SCORE_ONLY_DOCS =
  "https://langfuse.com/integrations/native/opentelemetry/migration-to-v4.md";

/** Message shared with the v4 events_only batch filter so clients handle both rejections the same way. */
export const LEGACY_INGESTION_SCORE_ONLY_REJECTION_MESSAGE =
  "Event type not accepted";

const LEGACY_INGESTION_NON_SCORE_REJECTED_METRIC =
  "langfuse.public_api.legacy_ingestion_non_score_rejected";

export type LegacyIngestionEventRejection = {
  id: string;
  status: 400;
  message: typeof LEGACY_INGESTION_SCORE_ONLY_REJECTION_MESSAGE;
  error: string;
};

/**
 * isLegacyIngestionScoreOnlyOrg reports whether legacy trace and observation
 * ingestion is closed for this organization. An unset cutoff, or a scope that
 * does not carry organizationCreatedAt, leaves ingestion unchanged.
 * Organizations created at the cutoff instant are included.
 */
export function isLegacyIngestionScoreOnlyOrg(
  organizationCreatedAt: string | null | undefined,
): boolean {
  const cutoff = env.LANGFUSE_LEGACY_INGESTION_SCORE_ONLY_ORG_CREATED_CUTOFF;
  if (!cutoff || !organizationCreatedAt) return false;

  const createdAtMs = Date.parse(organizationCreatedAt);
  const cutoffMs = Date.parse(cutoff);
  if (Number.isNaN(createdAtMs) || Number.isNaN(cutoffMs)) return false;
  return createdAtMs >= cutoffMs;
}

/** filterBatchForLegacyIngestionScoreOnlyOrg keeps score-create events and rejects every other batch entry for cutoff organizations. */
export function filterBatchForLegacyIngestionScoreOnlyOrg(
  batch: unknown[],
  organizationCreatedAt: string | null | undefined,
): {
  batchForProcessing: unknown[];
  rejectedErrors: LegacyIngestionEventRejection[];
} {
  if (!isLegacyIngestionScoreOnlyOrg(organizationCreatedAt)) {
    return { batchForProcessing: batch, rejectedErrors: [] };
  }

  const batchForProcessing: unknown[] = [];
  const rejectedErrors: LegacyIngestionEventRejection[] = [];

  for (const event of batch) {
    const type = eventTypeOf(event);
    if (type === eventTypes.SCORE_CREATE) {
      batchForProcessing.push(event);
      continue;
    }
    rejectedErrors.push({
      id: eventIdOf(event),
      status: 400,
      message: LEGACY_INGESTION_SCORE_ONLY_REJECTION_MESSAGE,
      error: legacyIngestionNonScoreError(type),
    });
  }

  return { batchForProcessing, rejectedErrors };
}

/** legacyTracingWriteRejectionBody is the single-event form of the batch rejection. These routes are one write, so the per-event 400 is the HTTP status. */
export function legacyTracingWriteRejectionBody(): {
  message: typeof LEGACY_INGESTION_SCORE_ONLY_REJECTION_MESSAGE;
  error: string;
} {
  const cutoff = env.LANGFUSE_LEGACY_INGESTION_SCORE_ONLY_ORG_CREATED_CUTOFF;
  return {
    message: LEGACY_INGESTION_SCORE_ONLY_REJECTION_MESSAGE,
    error: `Legacy trace and observation writes are not accepted for organizations created at or after ${cutoff}. Send traces and observations to ${LEGACY_INGESTION_OTLP_TRACES}. Scores remain available through score-create events on POST /api/public/ingestion and through ${LEGACY_INGESTION_SCORES}. Docs: ${LEGACY_INGESTION_SCORE_ONLY_DOCS}`,
  };
}

/** noteLegacyIngestionScoreOnlyRejections counts and logs one request's rejected legacy writes. Caller attribution tags stay bounded; the user agent is log-only. */
export function noteLegacyIngestionScoreOnlyRejections(params: {
  rejectedCount: number;
  organizationCreatedAt: string | null | undefined;
  orgId: string | undefined;
  projectId: string | undefined;
  routeName: string;
  headers: Parameters<typeof extractPublicApiCallerAttribution>[0];
}): void {
  if (params.rejectedCount <= 0) return;

  const callerAttribution = extractPublicApiCallerAttribution(params.headers);
  recordIncrement(
    LEGACY_INGESTION_NON_SCORE_REJECTED_METRIC,
    params.rejectedCount,
    {
      ...(callerAttribution.sdkName
        ? { sdkName: callerAttribution.sdkName }
        : {}),
      ...(callerAttribution.sdkVersion
        ? { sdkVersion: callerAttribution.sdkVersion }
        : {}),
    },
  );
  logger.info(
    "Rejected legacy ingestion writes for organization created at or after cutoff",
    {
      orgId: params.orgId,
      projectId: params.projectId,
      apiRoute: params.routeName,
      rejectedEventCount: params.rejectedCount,
      organizationCreatedAt: params.organizationCreatedAt,
      cutoff: env.LANGFUSE_LEGACY_INGESTION_SCORE_ONLY_ORG_CREATED_CUTOFF,
      ...callerAttribution,
    },
  );
}

function legacyIngestionNonScoreError(type: string | null): string {
  const cutoff = env.LANGFUSE_LEGACY_INGESTION_SCORE_ONLY_ORG_CREATED_CUTOFF;
  return `Event type "${type ?? "unknown"}" is not accepted by the legacy ingestion API for organizations created at or after ${cutoff}. Only score-create events are accepted for those organizations. Send traces and observations to ${LEGACY_INGESTION_OTLP_TRACES}. Send scores as score-create events to POST /api/public/ingestion or to ${LEGACY_INGESTION_SCORES}. Docs: ${LEGACY_INGESTION_SCORE_ONLY_DOCS}`;
}

function eventTypeOf(event: unknown): string | null {
  if (typeof event !== "object" || event === null) return null;
  const type = (event as { type?: unknown }).type;
  return typeof type === "string" ? type : null;
}

function eventIdOf(event: unknown): string {
  if (typeof event !== "object" || event === null) return "unknown";
  const id = (event as { id?: unknown }).id;
  return typeof id === "string" ? id : "unknown";
}
