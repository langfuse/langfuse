import { type ApiDeprecationInfo } from "@langfuse/shared";

// LFE-10895. Family-level deprecation signals for legacy (v3) public API
// endpoints. Attach one via the `deprecation` route-config field; the response
// gets a top-level `_deprecation` key.

// Sunset date for the legacy v3 public API — single source of truth. Set to the
// end of October 2026; update here if the date moves.
export const V3_SUNSET_DATE = "2026-10-31";

// Shared deprecation reason — references the deprecated Langfuse v3 system
// version (not an API version). Customer-facing wording lives here — edit once.
const V3_NOTICE =
  "Langfuse v3 is deprecated; this endpoint will be removed in a future release.";

// v4 replacement endpoints, referenced by both the message and `replacement`.
const REPLACEMENT = {
  observationsV2: "GET /api/public/v2/observations",
  scoresV3: "GET /api/public/v3/scores",
  metricsV2: "GET /api/public/v2/metrics",
  otelTraces: "POST /api/public/otel/v1/traces",
} as const;

export const OBSERVATIONS_V1_DEPRECATION: ApiDeprecationInfo = {
  message: `${V3_NOTICE} Use ${REPLACEMENT.observationsV2} instead.`,
  replacement: REPLACEMENT.observationsV2,
  sunsetAt: V3_SUNSET_DATE,
};

// Traces have no drop-in successor; observations v2 is the closest v4 read surface.
export const TRACES_DEPRECATION: ApiDeprecationInfo = {
  message: `${V3_NOTICE} In Langfuse v4, read span and trace data via ${REPLACEMENT.observationsV2}.`,
  replacement: REPLACEMENT.observationsV2,
  sunsetAt: V3_SUNSET_DATE,
};

// Sessions have no replacement.
export const SESSIONS_DEPRECATION: ApiDeprecationInfo = {
  message: `${V3_NOTICE} It has no replacement.`,
  sunsetAt: V3_SUNSET_DATE,
};

export const SCORES_DEPRECATION: ApiDeprecationInfo = {
  message: `${V3_NOTICE} Use ${REPLACEMENT.scoresV3} instead.`,
  replacement: REPLACEMENT.scoresV3,
  sunsetAt: V3_SUNSET_DATE,
};

export const METRICS_DEPRECATION: ApiDeprecationInfo = {
  message: `${V3_NOTICE} Use ${REPLACEMENT.metricsV2} instead.`,
  replacement: REPLACEMENT.metricsV2,
  sunsetAt: V3_SUNSET_DATE,
};

// Legacy create/update endpoints (trace, generation, span, event) → OpenTelemetry.
export const LEGACY_INGESTION_DEPRECATION: ApiDeprecationInfo = {
  message: `${V3_NOTICE} Send data via the OpenTelemetry endpoint at ${REPLACEMENT.otelTraces} instead.`,
  replacement: REPLACEMENT.otelTraces,
  sunsetAt: V3_SUNSET_DATE,
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
