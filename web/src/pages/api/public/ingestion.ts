import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import {
  traceException,
  logger,
  getCurrentSpan,
  contextWithLangfuseProps,
  eventTypes,
  markProjectIngestFailure,
  createIngestionAttribution,
  processEventBatch,
  type ApiAccessLevel,
  redactLangfuseSecretKeys,
} from "@langfuse/shared/src/server";
import { telemetry } from "@/src/features/telemetry";
import { clickHouseRouteForRequest } from "@/src/features/public-api/server/clickHouseRequestTags";
import {
  jsonSchema,
  MethodNotAllowedError,
  BaseError,
  InternalServerError,
  ForbiddenError,
} from "@langfuse/shared";
import { isPrismaException } from "@/src/utils/exceptions";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import * as opentelemetry from "@opentelemetry/api";
import { env } from "@/src/env.mjs";
import {
  attachDeprecation,
  INGESTION_DEPRECATION,
} from "@/src/features/public-api/server/deprecations";
import {
  SDK_NAME_ATTRIBUTE,
  SDK_VERSION_ATTRIBUTE,
  extractSdkAttributes,
} from "@langfuse/shared/instrumentation/bootstrap";
import {
  shadowAuth,
  shadowAuthorize,
  __dangerouslySkipAuthz,
} from "@/src/features/public-api/server";
import {
  type AuthorizationContext,
  type ProjectAction,
} from "@/src/features/auth/policy/types";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4.5mb",
    },
  },
};

/**
 * This handler ingests data via the async workflow:
 * 1. Validation
 *   - Check that the user has permissions
 *   - Check whether rate-limits are breached
 *   - Check that the request is well-formed
 * 2. Async Processing (in processEventBatch, also reused for the POST scores
 *    endpoint and OTLP ingestion)
 *   - Upload each event to S3 for long-term storage and as an event cache
 *   - Add the event batch to the queue for async processing by the worker
 *
 * If the S3 upload fails, event processing is aborted (the request fails) so
 * that the queue never references a missing S3 object. There is no synchronous
 * fallback path.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  let projectIdForIngestFailure: string | undefined;

  try {
    await runMiddleware(req, res, cors);

    // add context of api call to the span
    const currentSpan = getCurrentSpan();

    // Preserve the raw x-langfuse-* attributes consumed by existing ingestion
    // dashboards. The canonical attributes below are shared by all public API
    // routes and intentionally use a bounded SDK name/version vocabulary.
    Object.keys(req.headers).forEach((header) => {
      if (
        header.toLowerCase().startsWith("x-langfuse") ||
        header.toLowerCase().startsWith("x_langfuse")
      ) {
        const value = req.headers[header];
        if (value === undefined) return;
        currentSpan?.setAttributes({
          [`langfuse.header.${header.slice(11).toLowerCase().replaceAll("_", "-")}`]:
            Array.isArray(value)
              ? value.map(redactLangfuseSecretKeys)
              : redactLangfuseSecretKeys(value),
        });
      }
    });

    const { sdkName, sdkVersion } = extractSdkAttributes(req.headers);
    if (sdkName) {
      currentSpan?.setAttribute(SDK_NAME_ATTRIBUTE, sdkName);
    }
    if (sdkVersion) {
      currentSpan?.setAttribute(SDK_VERSION_ATTRIBUTE, sdkVersion);
    }

    if (req.method !== "POST") throw new MethodNotAllowedError();

    // CHECK AUTH FOR ALL EVENTS; each event authorizes its own action below.
    const authResult = await shadowAuth({
      req,
      action: __dangerouslySkipAuthz,
      allowedAccessLevels: ["project", "scores"],
    });
    if (!authResult.success) throw authResult.error;
    const { scope, ctx: authCtx } = authResult;
    // shadowAuth's project/scores gating guarantees a projectId; narrow the invariant.
    if (!scope.projectId) {
      throw new InternalServerError("Missing projectId on an authorized scope");
    }
    const projectId = scope.projectId;
    projectIdForIngestFailure = projectId;
    if (scope.isIngestionSuspended) {
      throw new ForbiddenError(
        "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.",
      );
    }
    const authCheck = { validKey: true as const, scope };

    const ctx = contextWithLangfuseProps({
      headers: req.headers,
      projectId,
      apiKeyId: authCheck.scope.apiKeyId,
      clickhouse: {
        surface: "publicapi",
        route: clickHouseRouteForRequest(req),
      },
    });
    // Execute the rest of the handler within the context
    return opentelemetry.context.with(ctx, async () => {
      try {
        try {
          const rateLimitCheck =
            await RateLimitService.getInstance().rateLimitRequest(
              authCheck.scope,
              "ingestion",
            );

          if (rateLimitCheck?.isRateLimited()) {
            return rateLimitCheck.sendRestResponseIfLimited(res);
          }
        } catch (e) {
          // If rate-limiter returns an error, we log it and continue processing.
          // This allows us to fail open instead of reject requests.
          logger.error("Error while rate limiting", e);
        }

        const batchType = z.object({
          batch: z.array(z.unknown()),
          metadata: jsonSchema.nullish(),
        });

        const parsedSchema = batchType.safeParse(req.body);

        if (!parsedSchema.success) {
          logger.info("Invalid request data", parsedSchema.error);
          return res.status(400).json({
            message: "Invalid request data",
            errors: parsedSchema.error.issues.map((issue) => issue.message),
          });
        }

        await telemetry();

        // V4 events_only mode: refuse every non-score event because trace and
        // observation writes target legacy ClickHouse tables this deployment
        // no longer reads. SDK logs are no longer accepted in this mode.
        // Reject per-event so a mixed batch still processes its score events.
        const isEventsOnlyMode =
          env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "events_only";
        const { batchForProcessing, rejectedErrors } = filterBatchForEventsOnly(
          parsedSchema.data.batch,
          isEventsOnlyMode,
        );

        const attribution = createIngestionAttribution({
          headers: req.headers,
          authCheck,
        });

        if (isEventsOnlyMode && rejectedErrors.length > 0) {
          logger.warn(
            `Rejected ${rejectedErrors.length} event(s) from the legacy /api/public/ingestion endpoint for project ${projectId} because this Langfuse v4 deployment runs in events_only mode. These events were not stored. ${EVENTS_ONLY_INGESTION_REMEDIATION}`,
            {
              sdkName: attribution.ingestionSdkName,
              sdkVersion: attribution.ingestionSdkVersion,
            },
          );
        }

        const authorized = authorizeIngestionBatch(
          batchForProcessing,
          authCtx,
          scope.accessLevel,
          projectId,
        );

        const result = await processEventBatch(
          authorized.batchForProcessing,
          authCheck,
          { attribution },
        );
        result.errors = [
          ...result.errors,
          ...rejectedErrors,
          ...authorized.rejectedErrors,
        ];

        // Cloud-only: a 207 with every event 201 is how agents conclude the
        // legacy write path is healthy. Stamp when the original batch asked
        // to write a trace or observation, including events_only rejections.
        const deprecation =
          env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION &&
          batchContainsTraceOrObservationEvent(parsedSchema.data.batch)
            ? INGESTION_DEPRECATION
            : undefined;

        return res.status(207).json(attachDeprecation(result, deprecation));
      } catch (error) {
        if (!(error instanceof BaseError && error.isUserError())) {
          markProjectIngestFailure(projectId, {
            source: "public_ingestion_api",
            reason: "api_internal_error",
          });
        }
        throw error;
      }
    });
  } catch (error: unknown) {
    if (error instanceof BaseError) {
      if (!error.isUserError()) {
        logger.error(error);
        traceException(error);
        if (projectIdForIngestFailure) {
          markProjectIngestFailure(projectIdForIngestFailure, {
            source: "public_ingestion_api",
            reason: "api_internal_error",
          });
        }
      }

      return res.status(error.httpCode).json({
        error: error.name,
        message: error.message,
      });
    }

    if (error instanceof z.ZodError) {
      logger.error(`Zod exception`, error.issues);
      return res.status(400).json({
        message: "Invalid request data",
        error: error.issues,
      });
    }

    logger.error("error_handling_ingestion_event", error);
    traceException(error);

    if (projectIdForIngestFailure) {
      markProjectIngestFailure(projectIdForIngestFailure, {
        source: "public_ingestion_api",
        reason: "api_internal_error",
      });
    }

    if (isPrismaException(error)) {
      return res.status(500).json({
        error: "Internal Server Error",
      });
    }

    const errorMessage =
      error instanceof Error ? error.message : "An unknown error occurred";
    res.status(500).json({
      message: "Invalid request data",
      errors: [errorMessage],
    });
  }
}

// Scores keep their own ClickHouse table and are the only event type accepted
// by this endpoint in V4 events_only mode.
const EVENTS_ONLY_ALLOWED_TYPES = new Set<string>([eventTypes.SCORE_CREATE]);

const TRACE_OR_OBSERVATION_EVENT_TYPES = new Set<string>(
  Object.values(eventTypes).filter(
    (type) =>
      type !== eventTypes.SCORE_CREATE &&
      type !== eventTypes.SDK_LOG &&
      type !== eventTypes.DATASET_RUN_ITEM_CREATE,
  ),
);

const EVENTS_ONLY_INGESTION_DOCS_URL =
  "https://langfuse.com/self-hosting/upgrade/upgrade-guides/upgrade-v3-to-v4";

const EVENTS_ONLY_INGESTION_REMEDIATION = [
  "Upgrade the client or integration to a v4-compatible SDK or OTLP ingestion path.",
  "As a temporary migration bridge, set LANGFUSE_MIGRATION_V4_WRITE_MODE=dual on both the web and worker services and redeploy.",
  `Docs: ${EVENTS_ONLY_INGESTION_DOCS_URL}`,
].join(" ");

export function filterBatchForEventsOnly(
  batch: unknown[],
  isEventsOnlyMode: boolean,
): IngestionBatchFilter {
  if (!isEventsOnlyMode) {
    return { batchForProcessing: batch, rejectedErrors: [] };
  }

  const batchForProcessing: unknown[] = [];
  const rejectedErrors: IngestionEventRejection[] = [];

  for (const event of batch) {
    const eventObj =
      typeof event === "object" && event !== null
        ? (event as { id?: unknown; type?: unknown })
        : null;
    const type =
      eventObj && typeof eventObj.type === "string" ? eventObj.type : null;
    const id =
      eventObj && typeof eventObj.id === "string" ? eventObj.id : "unknown";

    if (type && EVENTS_ONLY_ALLOWED_TYPES.has(type)) {
      batchForProcessing.push(event);
    } else {
      rejectedErrors.push({
        id,
        status: 400,
        message: "Event type not accepted",
        error: `Event type "${type ?? "unknown"}" is not accepted by /api/public/ingestion when LANGFUSE_MIGRATION_V4_WRITE_MODE is events_only. This endpoint only accepts score events. ${EVENTS_ONLY_INGESTION_REMEDIATION}`,
      });
    }
  }

  return { batchForProcessing, rejectedErrors };
}

/** authorizeIngestionBatch authorizes each event against the resolved context, dropping enforce-mode denials as 207 rejections; legacy and shadow keep every event. */
function authorizeIngestionBatch(
  batch: unknown[],
  ctx: AuthorizationContext | undefined,
  accessLevel: ApiAccessLevel,
  projectId: string,
): IngestionBatchFilter {
  const batchForProcessing: unknown[] = [];
  const rejectedErrors: IngestionEventRejection[] = [];

  for (const event of batch) {
    const decision = shadowAuthorize({
      ctx,
      action: ingestionActionForEventType(eventTypeOf(event)),
      resource: { projectId },
      accessLevel,
    });
    if (!decision.success) {
      rejectedErrors.push({
        id: idOf(event),
        status: 401,
        message: "Authentication error",
        error: "Access Scope Denied",
      });
      continue;
    }
    batchForProcessing.push(event);
  }
  return { batchForProcessing, rejectedErrors };
}

/** ingestionActionForEventType maps an event type to the project action its write asserts; SDK logs skip authz. */
function ingestionActionForEventType(
  type: string | null,
): ProjectAction | typeof __dangerouslySkipAuthz {
  if (type === eventTypes.SDK_LOG) return __dangerouslySkipAuthz;
  if (type === eventTypes.SCORE_CREATE) return "scores:create";
  return "traces:create";
}

/** idOf reads an event's `id`, defaulting to `unknown` for a malformed event. */
function idOf(event: unknown): string {
  return typeof event === "object" &&
    event !== null &&
    "id" in event &&
    typeof (event as { id: unknown }).id === "string"
    ? (event as { id: string }).id
    : "unknown";
}

function eventTypeOf(event: unknown): string | null {
  if (typeof event !== "object" || event === null) {
    return null;
  }
  const type = (event as { type?: unknown }).type;
  return typeof type === "string" ? type : null;
}

function batchContainsTraceOrObservationEvent(batch: unknown[]): boolean {
  return batch.some((event) => {
    const type = eventTypeOf(event);
    return type !== null && TRACE_OR_OBSERVATION_EVENT_TYPES.has(type);
  });
}

/** IngestionEventRejection is one event dropped from a batch, rendered in the 207 result's errors. */
type IngestionEventRejection = {
  id: string;
  status: number;
  message: string;
  error: string;
};

/** IngestionBatchFilter is a batch split into the events to process and the events rejected. */
type IngestionBatchFilter = {
  batchForProcessing: unknown[];
  rejectedErrors: IngestionEventRejection[];
};
