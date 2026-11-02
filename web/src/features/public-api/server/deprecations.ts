import { type NextApiResponse } from "next";
import { type ApiDeprecationInfo } from "@langfuse/shared";

// Family-level deprecation signals for legacy (v3) public API
// endpoints. Attach one via the `deprecation` route-config field.

// Sunset date for the legacy v3 public API — single source of truth. If the
// date moves, update both constants and every Fern availability message;
// openapi-deprecations.servertest.ts fails on any drift between the three.
export const V3_SUNSET_DATE = "2026-11-16";
export const V3_SUNSET_HUMAN = "November 16, 2026";
/** V3_DEPRECATED_AT is the `Deprecation` header date: when the v3 signal first shipped. */
const V3_DEPRECATED_AT = "2026-07-23";

// Shared deprecation reason — references the deprecated Langfuse v3 system
// version (not an API version). Customer-facing wording lives here — edit once.
export const V3_DELAY_NOTICE =
  "The only path to live data is OpenTelemetry ingestion combined with GET /api/public/v2/observations and GET /api/public/v2/metrics. All other public APIs may have data delays of several minutes.";

/** v3Notice builds the v3 sunset message, leading with the removal date and replacement. */
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
  observationsV2:
    "https://langfuse.com/docs/api-and-data-platform/features/public-api#v2",
  scoresV3:
    "https://langfuse.com/docs/api-and-data-platform/features/public-api#v3",
  metricsV2: "https://langfuse.com/docs/metrics/features/metrics-api",
  compatibility: "https://langfuse.com/docs/compatibility",
  otel: "https://langfuse.com/integrations/native/opentelemetry",
  otelMigration:
    "https://langfuse.com/integrations/native/opentelemetry/migration-to-v4.md",
  sdkUpgrade: "https://langfuse.com/docs/observability/sdk/upgrade-path",
  v4: "https://langfuse.com/docs/v4",
  selfHostedV4Upgrade:
    "https://langfuse.com/self-hosting/upgrade/upgrade-guides/upgrade-v3-to-v4",
} as const;

/** LEGACY_TRACE_WRITE_REPLACEMENT is the SDK and OpenTelemetry pointer shared by legacy trace-write rejections. */
const LEGACY_TRACE_WRITE_REPLACEMENT = `Upgrade to the latest Langfuse SDKs, which send traces via OpenTelemetry, or send traces directly to ${REPLACEMENT.otelTraces}. Scores can still be sent via ${REPLACEMENT.scoreCreate}. Docs: ${DOCS.sdkUpgrade} ${DOCS.otelMigration}`;

/** LEGACY_INGESTION_ORG_CUTOFF_MESSAGE is the rejection for an organization created at or after the legacy-ingestion cutoff. */
export const LEGACY_INGESTION_ORG_CUTOFF_MESSAGE = `This ingestion API no longer accepts trace or observation writes for this organization. ${LEGACY_TRACE_WRITE_REPLACEMENT}`;

/** EVENTS_ONLY_UNAVAILABLE_MESSAGE is the 404 for a deployment in v4 events_only mode. */
export const EVENTS_ONLY_UNAVAILABLE_MESSAGE = `This endpoint is not available on deployments running in Langfuse v4 events_only mode. ${LEGACY_TRACE_WRITE_REPLACEMENT} Learn more about Langfuse v4 at ${DOCS.v4}.`;

/** EVENTS_ONLY_INGESTION_REMEDIATION is the per-event remediation for the legacy batch endpoint in events_only mode. */
export const EVENTS_ONLY_INGESTION_REMEDIATION = [
  LEGACY_TRACE_WRITE_REPLACEMENT,
  "As a temporary migration bridge, set LANGFUSE_MIGRATION_V4_WRITE_MODE=dual on both the web and worker services and redeploy.",
  `Self-hosted upgrade guide: ${DOCS.selfHostedV4Upgrade}`,
].join(" ");

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

/** LEGACY_WRITES_DEPRECATION covers the single-object trace and observation writes (POST /traces, /spans, /generations, /events, PATCH /spans, /generations). */
export const LEGACY_WRITES_DEPRECATION: ApiDeprecationInfo = {
  message: v3Notice(
    `Use ${REPLACEMENT.otelTraces} instead, or upgrade to the current Python and JS SDKs.`,
  ),
  replacement: REPLACEMENT.otelTraces,
  docsUrl: DOCS.otelMigration,
  sunsetAt: V3_SUNSET_DATE,
};

/** AUTH_ERROR_STATUSES are statuses a replacement endpoint would not fix. */
const AUTH_ERROR_STATUSES = new Set([401, 403]);
const JSON_WITHOUT_HINT = Symbol("jsonWithoutReplacementHint");

/** sendAuthErrorJson writes an auth error; on deprecated routes it keeps the notice but skips the replacement hint, which would not fix an auth failure. */
export function sendAuthErrorJson(
  res: NextApiResponse,
  status: number,
  body: unknown,
) {
  res.status(status);
  const send: unknown = Reflect.get(res, JSON_WITHOUT_HINT);
  if (typeof send === "function") {
    send(body);
    return;
  }
  res.json(body);
}

/** withDeprecationResponse sets the deprecation headers and returns a view of `res` whose `json` stamps the notice, plus the replacement hint on non-auth 4xx errors. */
export function withDeprecationResponse(
  res: NextApiResponse,
  deprecation: ApiDeprecationInfo,
): NextApiResponse {
  setDeprecationHeaders(res, deprecation);
  const json = (body: unknown) => {
    const status = res.statusCode;
    const hinted =
      status >= 400 && status < 500 && !AUTH_ERROR_STATUSES.has(status)
        ? appendReplacementHint(body, deprecation)
        : body;
    res.json(attachDeprecation(hinted, deprecation));
  };
  const jsonWithoutHint = (body: unknown) =>
    res.json(attachDeprecation(body, deprecation));
  const response: NextApiResponse = new Proxy(res, {
    get(target, property) {
      if (property === "json") return json;
      if (property === JSON_WITHOUT_HINT) return jsonWithoutHint;
      // `status` returns the underlying response; keep chained `.json()` on this view.
      if (property === "status") {
        return (code: number) => {
          target.status(code);
          return response;
        };
      }
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return response;
}

/** attachDeprecation prepends `_deprecation` to an object body and `deprecation` to its `meta`; other bodies pass through unchanged. */
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

/** appendReplacementHint ends an error body's `message` with the replacement unless it already names it. */
function appendReplacementHint(
  body: unknown,
  deprecation: ApiDeprecationInfo,
): unknown {
  const replacement = deprecation.replacement;
  if (
    !replacement ||
    !isPlainObject(body) ||
    typeof body.message !== "string"
  ) {
    return body;
  }
  const replacementPath = toReplacementPath(replacement);
  if (replacementPath && body.message.includes(replacementPath)) {
    return body;
  }
  const message = body.message.trimEnd();
  const separator = /[.!?]$/.test(message) ? " " : ". ";
  return {
    ...body,
    message: `${message}${separator}Use ${replacement} instead.`,
  };
}

/** setDeprecationHeaders sets the RFC 9745 `Deprecation`, RFC 8594 `Sunset` and RFC 8288 `Link` headers. */
export function setDeprecationHeaders(
  res: NextApiResponse,
  deprecation: ApiDeprecationInfo,
) {
  res.setHeader("Deprecation", `@${toUnixSeconds(V3_DEPRECATED_AT)}`);
  if (deprecation.sunsetAt) {
    res.setHeader("Sunset", toUtcMidnight(deprecation.sunsetAt).toUTCString());
  }
  const links: string[] = [];
  const successorPath = deprecation.replacement
    ? toReplacementPath(deprecation.replacement)
    : undefined;
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

/** toReplacementPath turns "GET /api/public/v2/observations?from=..." into "/api/public/v2/observations". */
function toReplacementPath(replacement: string): string | undefined {
  return replacement.split(" ")[1]?.split("?")[0];
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
