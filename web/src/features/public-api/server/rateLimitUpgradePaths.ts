export type RateLimitUpgradePath = {
  legacyEndpoint: string;
  replacementEndpoint: string;
  docsUrl: string;
};

export const OBSERVATIONS_API_V2_DOCS_URL =
  "https://langfuse.com/docs/api-and-data-platform/features/observations-api";

export const legacyPublicApiRateLimitUpgradePaths = {
  tracesList: {
    legacyEndpoint: "GET /api/public/traces",
    replacementEndpoint:
      "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>",
    docsUrl: OBSERVATIONS_API_V2_DOCS_URL,
  },
  traceGet: {
    legacyEndpoint: "GET /api/public/traces/{traceId}",
    replacementEndpoint:
      "GET /api/public/v2/observations?traceId={traceId}&fromStartTime=<from>&toStartTime=<to>",
    docsUrl: OBSERVATIONS_API_V2_DOCS_URL,
  },
  observationsList: {
    legacyEndpoint: "GET /api/public/observations",
    replacementEndpoint:
      "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>",
    docsUrl: OBSERVATIONS_API_V2_DOCS_URL,
  },
  observationGet: {
    legacyEndpoint: "GET /api/public/observations/{observationId}",
    replacementEndpoint:
      "GET /api/public/v2/observations?filter=<urlencoded id filter>&fromStartTime=<from>&toStartTime=<to>",
    docsUrl: OBSERVATIONS_API_V2_DOCS_URL,
  },
  sessionsList: {
    legacyEndpoint: "GET /api/public/sessions",
    replacementEndpoint:
      "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>",
    docsUrl: OBSERVATIONS_API_V2_DOCS_URL,
  },
  sessionGet: {
    legacyEndpoint: "GET /api/public/sessions/{sessionId}",
    replacementEndpoint:
      "GET /api/public/v2/observations?filter=<urlencoded sessionId filter>&fromStartTime=<from>&toStartTime=<to>",
    docsUrl: OBSERVATIONS_API_V2_DOCS_URL,
  },
} satisfies Record<string, RateLimitUpgradePath>;

export const getRateLimitUpgradeMessage = ({
  legacyEndpoint,
  replacementEndpoint,
}: RateLimitUpgradePath) =>
  `Rate limit exceeded for ${legacyEndpoint}. Use ${replacementEndpoint} for high-volume reads.`;
