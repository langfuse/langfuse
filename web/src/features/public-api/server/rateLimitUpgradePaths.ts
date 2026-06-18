export type RateLimitUpgradePath = {
  legacyEndpoint: string;
  replacementEndpoint: string;
  docsUrl: string;
  notes?: string[];
};

export const OBSERVATIONS_API_V2_DOCS_URL =
  "https://langfuse.com/docs/api-and-data-platform/features/observations-api";

export const LEGACY_PUBLIC_API_RATE_LIMIT_MESSAGE =
  "Rate limit exceeded for this legacy public API endpoint. Use the v2 Observations API for high-volume reads.";

const boundedWindowNote =
  "Always include fromStartTime and toStartTime to keep each request bounded.";

export const legacyPublicApiRateLimitUpgradePaths = {
  tracesList: {
    legacyEndpoint: "GET /api/public/traces",
    replacementEndpoint:
      "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>",
    docsUrl: OBSERVATIONS_API_V2_DOCS_URL,
    notes: [
      "Group returned rows by traceId to reconstruct trace activity, or keep one representative row per trace when you only need trace identity.",
      boundedWindowNote,
    ],
  },
  traceGet: {
    legacyEndpoint: "GET /api/public/traces/{traceId}",
    replacementEndpoint:
      "GET /api/public/v2/observations?traceId={traceId}&fromStartTime=<from>&toStartTime=<to>",
    docsUrl: OBSERVATIONS_API_V2_DOCS_URL,
    notes: [
      "The v2 Observations API returns observation rows, not a full trace object.",
      boundedWindowNote,
    ],
  },
  observationsList: {
    legacyEndpoint: "GET /api/public/observations",
    replacementEndpoint:
      "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>",
    docsUrl: OBSERVATIONS_API_V2_DOCS_URL,
    notes: [
      "Use fields=<groups> to request only the field groups your integration needs.",
      boundedWindowNote,
    ],
  },
  observationGet: {
    legacyEndpoint: "GET /api/public/observations/{observationId}",
    replacementEndpoint:
      "GET /api/public/v2/observations?filter=<urlencoded id filter>&fromStartTime=<from>&toStartTime=<to>",
    docsUrl: OBSERVATIONS_API_V2_DOCS_URL,
    notes: [
      "Use a URL-encoded filter condition on the id column for single-observation lookups.",
      boundedWindowNote,
    ],
  },
  sessionsList: {
    legacyEndpoint: "GET /api/public/sessions",
    replacementEndpoint:
      "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>",
    docsUrl: OBSERVATIONS_API_V2_DOCS_URL,
    notes: [
      "Group returned rows by sessionId to reconstruct session activity.",
      "Request fields=core,basic,trace_context when you need session, trace, and tag context.",
      boundedWindowNote,
    ],
  },
  sessionGet: {
    legacyEndpoint: "GET /api/public/sessions/{sessionId}",
    replacementEndpoint:
      "GET /api/public/v2/observations?filter=<urlencoded sessionId filter>&fromStartTime=<from>&toStartTime=<to>",
    docsUrl: OBSERVATIONS_API_V2_DOCS_URL,
    notes: [
      "Use a URL-encoded filter condition on the sessionId column for single-session lookups.",
      "The v2 Observations API returns observation rows, not a full session object.",
      boundedWindowNote,
    ],
  },
} satisfies Record<string, RateLimitUpgradePath>;
