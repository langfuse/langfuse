import { type ApiDeprecationInfo } from "@langfuse/shared";
import { OBSERVATIONS_API_V2_DOCS_URL } from "./rateLimitUpgradePaths";

// LFE-10895. Family-level deprecation signals for legacy (v3) public API
// endpoints. Attach one via the `deprecation` route-config field; the response
// gets a top-level `_deprecation` key.

// Shared deprecation reason — references the deprecated Langfuse v3 system
// version (not an API version). Customer-facing wording lives here — edit once.
const V3_NOTICE = `Langfuse v3 is deprecated; this endpoint will be removed in a future release.`;

// v4 replacement endpoints, referenced by both the message and `replacement`.
// Placeholder style matches rateLimitUpgradePaths (<from>, <to>, filters).
const REPLACEMENT = {
  observationsV2:
    "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>",
  observationsV2BySession:
    "GET /api/public/v2/observations?filter=<urlencoded sessionId filter>&fromStartTime=<from>&toStartTime=<to>",
  scoresV3: "GET /api/public/v3/scores",
  metricsV2: "GET /api/public/v2/metrics?query=<urlencoded json query>",
  otelTraces: "POST /api/public/otel/v1/traces",
  experimentItems:
    "GET /api/public/experiment-items?fromStartTime=<from>&toStartTime=<to>",
} as const;

// Migration guidance pages; each family points at the page that documents its
// replacement (all pages also serve markdown to agents via the `.md` routes).
const DOCS = {
  observationsV2: OBSERVATIONS_API_V2_DOCS_URL,
  scoresV3:
    "https://langfuse.com/docs/api-and-data-platform/features/scores-api",
  metricsV2: "https://langfuse.com/docs/metrics/features/metrics-api",
  compatibility: "https://langfuse.com/docs/compatibility",
  otel: "https://langfuse.com/integrations/native/opentelemetry",
} as const;

export const OBSERVATIONS_V1_DEPRECATION: ApiDeprecationInfo = {
  message: `${V3_NOTICE} Use ${REPLACEMENT.observationsV2} instead.`,
  replacement: REPLACEMENT.observationsV2,
  docsUrl: DOCS.observationsV2,
};

// Traces have no drop-in successor; observations v2 is the closest v4 read surface.
export const TRACES_DEPRECATION: ApiDeprecationInfo = {
  message: `${V3_NOTICE} In Langfuse v4, read span and trace data via ${REPLACEMENT.observationsV2}.`,
  replacement: REPLACEMENT.observationsV2,
  docsUrl: DOCS.observationsV2,
};

// Sessions have no drop-in successor; filter observations v2 by session instead.
export const SESSIONS_DEPRECATION: ApiDeprecationInfo = {
  message: `${V3_NOTICE} In Langfuse v4, read session data via ${REPLACEMENT.observationsV2BySession}.`,
  replacement: REPLACEMENT.observationsV2BySession,
  docsUrl: DOCS.observationsV2,
};

export const SCORES_DEPRECATION: ApiDeprecationInfo = {
  message: `${V3_NOTICE} Use ${REPLACEMENT.scoresV3} instead.`,
  replacement: REPLACEMENT.scoresV3,
  docsUrl: DOCS.scoresV3,
};

export const METRICS_DEPRECATION: ApiDeprecationInfo = {
  message: `${V3_NOTICE} Use ${REPLACEMENT.metricsV2} instead.`,
  replacement: REPLACEMENT.metricsV2,
  docsUrl: DOCS.metricsV2,
};

// Legacy dataset-run-items reads → experiment items (dataset runs are replaced
// by experiments in v4).
export const DATASET_RUN_ITEMS_DEPRECATION: ApiDeprecationInfo = {
  message: `${V3_NOTICE} In Langfuse v4, dataset run items are replaced by experiment items; use ${REPLACEMENT.experimentItems} instead.`,
  replacement: REPLACEMENT.experimentItems,
  docsUrl: DOCS.compatibility,
};

// Stamp a deprecation signal onto a JSON response body as the top-level
// `_deprecation` key. Non-object bodies (arrays, null, primitives) pass through
// unchanged so array/primitive responses are never corrupted.
export function attachDeprecation(
  body: unknown,
  deprecation: ApiDeprecationInfo | undefined,
): unknown {
  if (
    !deprecation ||
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    return body;
  }
  return { ...body, _deprecation: deprecation };
}
