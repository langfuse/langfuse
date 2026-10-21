import {
  eventTypes,
  extractPublicApiCallerAttribution,
  getCurrentSpan,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";

import { env } from "@/src/env.mjs";

// Current write paths. The cutoff closes the old batch ingestion API, not these.
const OTLP_TRACES_ROUTE = "POST /api/public/otel/v1/traces";
const SCORES_ROUTE = "POST /api/public/scores";
const LEGACY_INGESTION_SCORE_ONLY_DOCS =
  "https://langfuse.com/integrations/native/opentelemetry/migration-to-v4.md";

/** Message shared with the v4 events_only batch filter so clients handle both rejections the same way. */
export const LEGACY_INGESTION_SCORE_ONLY_REJECTION_MESSAGE =
  "Event type not accepted";

const LEGACY_INGESTION_NON_SCORE_REJECTED_METRIC =
  "langfuse.public_api.legacy_ingestion_non_score_rejected";

const SPAN_ATTRIBUTE_PREFIX = "langfuse.public_api.legacy_ingestion_score_only";

const KNOWN_EVENT_TYPES = new Set<string>(Object.values(eventTypes));

/** One rejection log per project and route per interval; the counter still sees every rejection. */
const REJECTION_LOG_INTERVAL_MS = 60_000;
const REJECTION_LOG_STATE_MAX_KEYS = 10_000;

type RejectionLogState = {
  lastLoggedAtMs: number;
  suppressedRequestCount: number;
  suppressedEventCount: number;
};

const rejectionLogState = new Map<string, RejectionLogState>();

/** LegacyIngestionPath separates the 207 batch endpoint from the single-write routes that answer 400. */
export type LegacyIngestionPath = "batch" | "single_write";

/** LegacyTracingWriteRoute names a single-write legacy route and the ingestion event it would write. */
export type LegacyTracingWriteRoute = {
  route: string;
  eventType: (typeof eventTypes)[keyof typeof eventTypes];
};

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

/**
 * rejectNonScoreCreateEvents keeps score-create events and returns a 400
 * rejection for every other batch entry. Callers supply the error text.
 * The deployment-wide events_only gate and the per-organization cutoff both
 * use this allow-list.
 */
export function rejectNonScoreCreateEvents(
  batch: unknown[],
  errorForType: (type: string | null) => string,
): {
  batchForProcessing: unknown[];
  rejectedErrors: LegacyIngestionEventRejection[];
} {
  const batchForProcessing: unknown[] = [];
  const rejectedErrors: LegacyIngestionEventRejection[] = [];

  for (const event of batch) {
    const type = ingestionEventTypeOf(event);
    if (type === eventTypes.SCORE_CREATE) {
      batchForProcessing.push(event);
      continue;
    }
    rejectedErrors.push({
      id: ingestionEventIdOf(event),
      status: 400,
      message: LEGACY_INGESTION_SCORE_ONLY_REJECTION_MESSAGE,
      error: errorForType(type),
    });
  }

  return { batchForProcessing, rejectedErrors };
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

  return rejectNonScoreCreateEvents(batch, legacyIngestionNonScoreError);
}

/** legacyTracingWriteRejectionBody is the single-event form of the batch rejection. These routes are one write, so the per-event 400 is the HTTP status. */
export function legacyTracingWriteRejectionBody(): {
  message: typeof LEGACY_INGESTION_SCORE_ONLY_REJECTION_MESSAGE;
  error: string;
} {
  const cutoff = env.LANGFUSE_LEGACY_INGESTION_SCORE_ONLY_ORG_CREATED_CUTOFF;
  return {
    message: LEGACY_INGESTION_SCORE_ONLY_REJECTION_MESSAGE,
    error: `Legacy trace and observation writes are not accepted for organizations created at or after ${cutoff}. Send traces and observations to ${OTLP_TRACES_ROUTE}. Scores remain available through score-create events on POST /api/public/ingestion and through ${SCORES_ROUTE}. Docs: ${LEGACY_INGESTION_SCORE_ONLY_DOCS}`,
  };
}

/**
 * noteLegacyIngestionScoreOnlyRejections records one request's rejected
 * legacy writes. Metric tags stay bounded: route, ingestion path, known event
 * type, and SDK name/version. Organization and project ids, the organization
 * createdAt, and the user agent go only to span attributes and the log.
 */
export function noteLegacyIngestionScoreOnlyRejections(params: {
  rejectedEventTypes: (string | null)[];
  ingestionPath: LegacyIngestionPath;
  route: string;
  organizationCreatedAt: string | null | undefined;
  orgId: string | undefined;
  projectId: string | undefined;
  headers: Parameters<typeof extractPublicApiCallerAttribution>[0];
}): void {
  const rejectedEventCount = params.rejectedEventTypes.length;
  if (rejectedEventCount <= 0) return;

  const countsByEventType = new Map<string, number>();
  for (const type of params.rejectedEventTypes) {
    const tag = type !== null && KNOWN_EVENT_TYPES.has(type) ? type : "unknown";
    countsByEventType.set(tag, (countsByEventType.get(tag) ?? 0) + 1);
  }
  const rejectedEventTypes = Object.fromEntries(
    [...countsByEventType].sort(([a], [b]) => a.localeCompare(b)),
  );

  const callerAttribution = extractPublicApiCallerAttribution(params.headers);
  for (const [eventType, count] of countsByEventType) {
    recordIncrement(LEGACY_INGESTION_NON_SCORE_REJECTED_METRIC, count, {
      route: params.route,
      ingestion_path: params.ingestionPath,
      event_type: eventType,
      ...(callerAttribution.sdkName
        ? { sdkName: callerAttribution.sdkName }
        : {}),
      ...(callerAttribution.sdkVersion
        ? { sdkVersion: callerAttribution.sdkVersion }
        : {}),
    });
  }

  const span = getCurrentSpan();
  span?.setAttribute(
    `${SPAN_ATTRIBUTE_PREFIX}.rejected_count`,
    rejectedEventCount,
  );
  span?.setAttribute(
    `${SPAN_ATTRIBUTE_PREFIX}.rejected_event_types`,
    Object.keys(rejectedEventTypes),
  );
  span?.setAttribute(
    `${SPAN_ATTRIBUTE_PREFIX}.ingestion_path`,
    params.ingestionPath,
  );
  if (params.organizationCreatedAt) {
    span?.setAttribute(
      `${SPAN_ATTRIBUTE_PREFIX}.organization_created_at`,
      params.organizationCreatedAt,
    );
  }
  if (params.projectId)
    span?.setAttribute("langfuse.project.id", params.projectId);
  if (params.orgId) span?.setAttribute("langfuse.org.id", params.orgId);

  const throttle = takeRejectionLogSlot(
    `${params.projectId ?? "unknown"}|${params.route}`,
    rejectedEventCount,
  );
  if (!throttle) return;

  logger.info(
    "Rejected legacy ingestion writes for organization created at or after cutoff",
    {
      orgId: params.orgId,
      projectId: params.projectId,
      apiRoute: params.route,
      ingestionPath: params.ingestionPath,
      rejectedEventCount,
      rejectedEventTypes,
      suppressedRequestCount: throttle.suppressedRequestCount,
      suppressedEventCount: throttle.suppressedEventCount,
      organizationCreatedAt: params.organizationCreatedAt,
      cutoff: env.LANGFUSE_LEGACY_INGESTION_SCORE_ONLY_ORG_CREATED_CUTOFF,
      ...callerAttribution,
    },
  );
}

/**
 * takeRejectionLogSlot returns the suppressed totals since the last log for
 * this key, or null while the key is inside its interval. Per web process,
 * so a busy client logs about once per interval per replica.
 */
function takeRejectionLogSlot(
  key: string,
  rejectedEventCount: number,
): { suppressedRequestCount: number; suppressedEventCount: number } | null {
  const now = Date.now();
  const state = rejectionLogState.get(key);
  if (state && now - state.lastLoggedAtMs < REJECTION_LOG_INTERVAL_MS) {
    state.suppressedRequestCount += 1;
    state.suppressedEventCount += rejectedEventCount;
    return null;
  }

  if (!state && rejectionLogState.size >= REJECTION_LOG_STATE_MAX_KEYS) {
    const oldestKey = rejectionLogState.keys().next().value;
    if (oldestKey !== undefined) rejectionLogState.delete(oldestKey);
  }
  rejectionLogState.delete(key);
  rejectionLogState.set(key, {
    lastLoggedAtMs: now,
    suppressedRequestCount: 0,
    suppressedEventCount: 0,
  });
  return {
    suppressedRequestCount: state?.suppressedRequestCount ?? 0,
    suppressedEventCount: state?.suppressedEventCount ?? 0,
  };
}

function legacyIngestionNonScoreError(type: string | null): string {
  const cutoff = env.LANGFUSE_LEGACY_INGESTION_SCORE_ONLY_ORG_CREATED_CUTOFF;
  return `Event type "${type ?? "unknown"}" is not accepted by the legacy ingestion API for organizations created at or after ${cutoff}. Only score-create events are accepted for those organizations. Send traces and observations to ${OTLP_TRACES_ROUTE}. Send scores as score-create events to POST /api/public/ingestion or to ${SCORES_ROUTE}. Docs: ${LEGACY_INGESTION_SCORE_ONLY_DOCS}`;
}

/** ingestionEventTypeOf reads an event's `type`, or null when the event is malformed. */
export function ingestionEventTypeOf(event: unknown): string | null {
  if (typeof event !== "object" || event === null) return null;
  const type = (event as { type?: unknown }).type;
  return typeof type === "string" ? type : null;
}

/** ingestionEventIdOf reads an event's `id`, defaulting to `unknown` for a malformed event. */
export function ingestionEventIdOf(event: unknown): string {
  if (typeof event !== "object" || event === null) return "unknown";
  const id = (event as { id?: unknown }).id;
  return typeof id === "string" ? id : "unknown";
}
