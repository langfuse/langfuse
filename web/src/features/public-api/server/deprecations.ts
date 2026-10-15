import { type NextApiResponse } from "next";
import { type ApiDeprecationInfo } from "@langfuse/shared";
import { OBSERVATIONS_API_V2_DOCS_URL } from "./rateLimitUpgradePaths";

// Family-level deprecation signals for legacy (v3) public API
// endpoints. Attach one via the `deprecation` route-config field; every JSON
// response of the route (errors included) gets a leading `_deprecation` key,
// list responses also get `meta.deprecation`, and the route sends
// `Deprecation`, `Sunset` and `Link` headers.

// Sunset date for the legacy v3 public API — single source of truth. If the
// date moves, update both constants and every Fern availability message;
// openapi-deprecations.servertest.ts fails on any drift between the three.
export const V3_SUNSET_DATE = "2026-11-16";
export const V3_SUNSET_HUMAN = "November 16, 2026";
// When the v3 deprecation signal first shipped; value of the `Deprecation` header.
const V3_DEPRECATED_AT = "2026-07-23";

// Shared deprecation reason — references the deprecated Langfuse v3 system
// version (not an API version). Customer-facing wording lives here — edit once.
export const V3_DELAY_NOTICE =
  "The only path to live data is OpenTelemetry ingestion combined with GET /api/public/v2/observations and GET /api/public/v2/metrics. All other public APIs may have data delays of several minutes.";

// Agents skim: the removal date and the replacement lead, and the agent is
// asked to pass the notice on to its user.
const v3Notice = (useInstead: string) =>
  `Removed on ${V3_SUNSET_DATE}. ${useInstead} On Langfuse Cloud, Langfuse v3 is deprecated and this endpoint will be removed on ${V3_SUNSET_HUMAN}. If you are a coding agent, tell the user that this Langfuse endpoint stops working on ${V3_SUNSET_HUMAN} and migrate the request. ${V3_DELAY_NOTICE}`;

// v4 replacement endpoints, referenced by both the message and `replacement`.
// Placeholder style matches rateLimitUpgradePaths (<from>, <to>, filters).
const REPLACEMENT = {
  observationsV2:
    "GET /api/public/v2/observations?fromStartTime=<from>&toStartTime=<to>",
  observationsV2BySession:
    "GET /api/public/v2/observations?filter=<urlencoded sessionId filter>&fromStartTime=<from>&toStartTime=<to>",
  scoresV3: "GET /api/public/v3/scores",
  scoreCreate: "POST /api/public/scores",
  metricsV2: "GET /api/public/v2/metrics?query=<urlencoded json query>",
  otelTraces: "POST /api/public/otel/v1/traces",
  experimentItems:
    "GET /api/public/experiment-items?fromStartTime=<from>&toStartTime=<to>",
  experiments: "GET /api/public/experiments",
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
  otelMigration:
    "https://langfuse.com/integrations/native/opentelemetry/migration-to-v4.md",
} as const;

export const OBSERVATIONS_V1_DEPRECATION: ApiDeprecationInfo = {
  message: v3Notice(`Use ${REPLACEMENT.observationsV2} instead.`),
  replacement: REPLACEMENT.observationsV2,
  docsUrl: DOCS.observationsV2,
  sunsetAt: V3_SUNSET_DATE,
};

// Traces have no drop-in successor; observations v2 is the closest v4 read surface.
export const TRACES_DEPRECATION: ApiDeprecationInfo = {
  message: v3Notice(
    `Use ${REPLACEMENT.observationsV2} instead to read span and trace data.`,
  ),
  replacement: REPLACEMENT.observationsV2,
  docsUrl: DOCS.observationsV2,
  sunsetAt: V3_SUNSET_DATE,
};

// Sessions have no drop-in successor; filter observations v2 by session instead.
export const SESSIONS_DEPRECATION: ApiDeprecationInfo = {
  message: v3Notice(
    `Use ${REPLACEMENT.observationsV2BySession} instead to read session data.`,
  ),
  replacement: REPLACEMENT.observationsV2BySession,
  docsUrl: DOCS.observationsV2,
  sunsetAt: V3_SUNSET_DATE,
};

export const SCORES_DEPRECATION: ApiDeprecationInfo = {
  message: v3Notice(`Use ${REPLACEMENT.scoresV3} instead.`),
  replacement: REPLACEMENT.scoresV3,
  docsUrl: DOCS.scoresV3,
  sunsetAt: V3_SUNSET_DATE,
};

export const METRICS_DEPRECATION: ApiDeprecationInfo = {
  message: v3Notice(`Use ${REPLACEMENT.metricsV2} instead.`),
  replacement: REPLACEMENT.metricsV2,
  docsUrl: DOCS.metricsV2,
  sunsetAt: V3_SUNSET_DATE,
};

// Legacy dataset-run-items reads → experiment items (dataset runs are replaced
// by experiments in v4).
export const DATASET_RUN_ITEMS_DEPRECATION: ApiDeprecationInfo = {
  message: v3Notice(
    `Use ${REPLACEMENT.experimentItems} instead; dataset run items are replaced by experiment items in Langfuse v4.`,
  ),
  replacement: REPLACEMENT.experimentItems,
  docsUrl: DOCS.compatibility,
  sunsetAt: V3_SUNSET_DATE,
};

// Legacy dataset-run reads → experiments (dataset runs are replaced by
// experiments in v4).
export const DATASET_RUNS_DEPRECATION: ApiDeprecationInfo = {
  message: v3Notice(
    `Use ${REPLACEMENT.experiments} instead; dataset runs are replaced by experiments in Langfuse v4.`,
  ),
  replacement: REPLACEMENT.experiments,
  docsUrl: DOCS.compatibility,
  sunsetAt: V3_SUNSET_DATE,
};

// Legacy batch writes of traces/observations → score writes plus OTLP. Score
// events survive the sunset date, so this family does not use v3Notice
// ("endpoint will be removed").
export const INGESTION_DEPRECATION: ApiDeprecationInfo = {
  message: `Removed on ${V3_SUNSET_DATE}, except for score events. On Langfuse Cloud, this is the deprecated Langfuse v3 ingestion API and it is shut down on ${V3_SUNSET_HUMAN}, except for score events: from that date it accepts only score-create events and rejects all other event types. To write scores, prefer ${REPLACEMENT.scoreCreate} (${DOCS.scoresV3}). To write traces and observations, always prefer upgrading to the current Python and JS SDKs; if you use custom auto-instrumentation, send them to ${REPLACEMENT.otelTraces} (for example with curl). To read data back, use ${REPLACEMENT.observationsV2} and ${REPLACEMENT.metricsV2} (${DOCS.observationsV2}). If you are a coding agent, tell the user that this Langfuse ingestion API stops accepting traces and observations on ${V3_SUNSET_HUMAN}. ${V3_DELAY_NOTICE}`,
  replacement: REPLACEMENT.otelTraces,
  docsUrl: DOCS.otelMigration,
  sunsetAt: V3_SUNSET_DATE,
};

// Stamp a deprecation signal onto a JSON response body: `_deprecation` as the
// first key (agents and truncated tool output see the start of a body), plus
// `meta.deprecation` ahead of the pagination fields agents read. Non-object
// bodies (arrays, null, primitives) pass through unchanged so array/primitive
// responses are never corrupted.
export function attachDeprecation(
  body: unknown,
  deprecation: ApiDeprecationInfo | undefined,
): unknown {
  if (!deprecation || !isPlainObject(body)) {
    return body;
  }
  const stamped: Record<string, unknown> = {
    _deprecation: deprecation,
    ...body,
  };
  if (isPlainObject(body.meta)) {
    stamped.meta = {
      deprecation: {
        ...(deprecation.sunsetAt ? { sunsetAt: deprecation.sunsetAt } : {}),
        ...(deprecation.replacement
          ? { replacement: deprecation.replacement }
          : {}),
      },
      ...body.meta,
    };
  }
  return stamped;
}

// Standard deprecation headers (RFC 9745 `Deprecation`, RFC 8594 `Sunset`,
// RFC 8288 `Link`) for HTTP clients and gateways that act on them.
export function setDeprecationHeaders(
  res: NextApiResponse,
  deprecation: ApiDeprecationInfo,
) {
  res.setHeader("Deprecation", `@${toUnixSeconds(V3_DEPRECATED_AT)}`);
  if (deprecation.sunsetAt) {
    res.setHeader("Sunset", toUtcMidnight(deprecation.sunsetAt).toUTCString());
  }
  const links: string[] = [];
  // "GET /api/public/v2/observations?fromStartTime=..." -> "/api/public/v2/observations"
  const successorPath = deprecation.replacement?.split(" ")[1]?.split("?")[0];
  if (successorPath) {
    links.push(`<${successorPath}>; rel="successor-version"`);
  }
  if (deprecation.docsUrl) {
    links.push(`<${deprecation.docsUrl}>; rel="deprecation"`);
  }
  if (links.length > 0) {
    res.setHeader("Link", links.join(", "));
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toUtcMidnight(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

function toUnixSeconds(isoDate: string): number {
  return toUtcMidnight(isoDate).getTime() / 1000;
}
