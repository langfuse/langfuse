import { cors, runMiddleware } from "@/src/features/public-api/server/cors";
import { type NextApiRequest, type NextApiResponse } from "next";
import { z } from "zod";
import {
  traceException,
  redis,
  logger,
  getCurrentSpan,
  contextWithLangfuseProps,
  eventTypes,
  markProjectIngestFailure,
} from "@langfuse/shared/src/server";
import { telemetry } from "@/src/features/telemetry";
import { clickHouseRouteForRequest } from "@/src/features/public-api/server/clickHouseRequestTags";
import { jsonSchema } from "@langfuse/shared";
import { isPrismaException } from "@/src/utils/exceptions";
import {
  MethodNotAllowedError,
  BaseError,
  UnauthorizedError,
  ForbiddenError,
} from "@langfuse/shared";
import { processEventBatch } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { ApiAuthService } from "@/src/features/public-api/server/apiAuth";
import { RateLimitService } from "@/src/features/public-api/server/RateLimitService";
import * as opentelemetry from "@opentelemetry/api";
import { env } from "@/src/env.mjs";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "4.5mb",
    },
  },
};

/**
 * This handler performs multiple actions to ingest data. It is compatible with the new async workflow, but also
 * supports the old synchronous workflow which processes events in the web container.
 * Overall, the processing of each incoming request happens in three stages
 * 1. Validation
 *   - Check that the user has permissions
 *   - Check whether rate-limits are breached
 *   - Check that the request is well-formed
 * 2. Async Processing
 *   - Upload each event to S3 for long-term storage and as an event cache
 *   - Add the event batch to the queue for async processing
 *   - Fallback to sync processing on errors
 * 3. Sync Processing
 * The last two stages live in a processEventBatch function which is reused for the POST scores endpoint and for
 * legacy event types.
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

    // get x-langfuse-xxx headers and add them to the span
    Object.keys(req.headers).forEach((header) => {
      if (
        header.toLowerCase().startsWith("x-langfuse") ||
        header.toLowerCase().startsWith("x_langfuse")
      ) {
        currentSpan?.setAttributes({
          [`langfuse.header.${header.slice(11).toLowerCase().replaceAll("_", "-")}`]:
            req.headers[header],
        });
      }
    });

    if (req.method !== "POST") throw new MethodNotAllowedError();

    // CHECK AUTH FOR ALL EVENTS
    const authCheck = await new ApiAuthService(
      prisma,
      redis,
    ).verifyAuthHeaderAndReturnScope(req.headers.authorization);

    if (!authCheck.validKey) {
      throw new UnauthorizedError(authCheck.error);
    }
    if (!authCheck.scope.projectId) {
      throw new UnauthorizedError(
        "Missing projectId in scope. Are you using an organization key?",
      );
    }
    const projectId = authCheck.scope.projectId;
    projectIdForIngestFailure = projectId;

    if (authCheck.scope.isIngestionSuspended) {
      throw new ForbiddenError(
        "Ingestion suspended: Usage threshold exceeded. Please upgrade your plan.",
      );
    }

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

        // V4 events_only mode: refuse trace/observation events because their
        // writes would land in the legacy ClickHouse tables this deployment no
        // longer reads. Scores and SDK logs are unaffected and pass through.
        // Reject per-event so a mixed batch still processes its score events.
        const { batchForProcessing, rejectedErrors } = filterBatchForEventsOnly(
          parsedSchema.data.batch,
          env.LANGFUSE_MIGRATION_V4_WRITE_MODE === "events_only",
        );

        const result = await processEventBatch(batchForProcessing, authCheck);
        if (rejectedErrors.length > 0) {
          result.errors = [...result.errors, ...rejectedErrors];
        }
        return res.status(207).json(result);
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

// Event types that may continue to ingest in V4 events_only mode. Scores keep
// their own ClickHouse table (no legacy traces/observations write); SDK logs
// are non-persisting.
const EVENTS_ONLY_ALLOWED_TYPES = new Set<string>([
  eventTypes.SCORE_CREATE,
  eventTypes.SDK_LOG,
  eventTypes.DATASET_RUN_ITEM_CREATE,
]);

function filterBatchForEventsOnly(
  batch: unknown[],
  isEventsOnlyMode: boolean,
): {
  batchForProcessing: unknown[];
  rejectedErrors: {
    id: string;
    status: number;
    message: string;
    error: string;
  }[];
} {
  if (!isEventsOnlyMode) {
    return { batchForProcessing: batch, rejectedErrors: [] };
  }

  const batchForProcessing: unknown[] = [];
  const rejectedErrors: {
    id: string;
    status: number;
    message: string;
    error: string;
  }[] = [];

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
        error: `Event type "${type ?? "unknown"}" is not accepted by /api/public/ingestion when LANGFUSE_MIGRATION_V4_WRITE_MODE is events_only. This endpoint only accepts score, log, and dataset-run-item events.`,
      });
    }
  }

  return { batchForProcessing, rejectedErrors };
}
