import {
  PostTracesV1Body,
  GetTracesV1Query,
  GetTracesV1Response,
  PostTracesV1Response,
  DeleteTracesV1Body,
  DeleteTracesV1Response,
  TRACE_FIELD_GROUPS,
  type TraceFieldGroup,
} from "@/src/features/public-api/types/traces";
import { InvalidRequestError } from "@langfuse/shared";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { processEventBatch } from "@langfuse/shared/src/server";
import {
  eventTypes,
  logger,
  traceDeletionProcessor,
  getTracesFromEventsTableForPublicApi,
  getTracesCountFromEventsTableForPublicApi,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { telemetry } from "@/src/features/telemetry";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  generateTracesForPublicApi,
  getTracesCountForPublicApi,
} from "@/src/features/public-api/server/traces";
import { env } from "@/src/env.mjs";

export default withMiddlewares({
  POST: createAuthedProjectAPIRoute({
    name: "Create Trace (Legacy)",
    bodySchema: PostTracesV1Body,
    responseSchema: PostTracesV1Response, // Adjust this if you have a specific response schema
    rateLimitResource: "legacy-ingestion",
    fn: async ({ body, auth, res }) => {
      await telemetry();
      const event = {
        id: v4(),
        type: eventTypes.TRACE_CREATE,
        timestamp: new Date().toISOString(),
        body: body,
      };
      if (!event.body.id) {
        event.body.id = v4();
      }
      const result = await processEventBatch([event], auth);
      if (result.errors.length > 0) {
        const error = result.errors[0];
        res
          .status(error.status)
          .json({ message: error.error ?? error.message });
        return { id: "" }; // dummy return
      }
      if (result.successes.length !== 1) {
        logger.error("Failed to create trace", { result });
        throw new Error("Failed to create trace");
      }
      return { id: event.body.id };
    },
  }),

  GET: createAuthedProjectAPIRoute({
    name: "Get Traces",
    querySchema: GetTracesV1Query,
    responseSchema: GetTracesV1Response,
    fn: async ({ query, auth }) => {
      // Api-performance controls.
      // 1. Reject if no date range and rejection is enabled
      if (
        env.LANGFUSE_API_TRACES_REJECT_NO_DATE_RANGE === "true" &&
        !query.fromTimestamp
      ) {
        throw new InvalidRequestError(
          "fromTimestamp is required. Set the fromTimestamp query parameter to filter traces by date.",
        );
      }

      // 2. Apply default date range if configured and no fromTimestamp provided
      const defaultDateRangeDays =
        env.LANGFUSE_API_TRACES_DEFAULT_DATE_RANGE_DAYS;
      let effectiveFromTimestamp = query.fromTimestamp ?? undefined;
      if (!query.fromTimestamp && defaultDateRangeDays) {
        const referenceDateMs = query.toTimestamp
          ? new Date(query.toTimestamp).getTime()
          : Date.now();
        effectiveFromTimestamp = new Date(
          referenceDateMs - defaultDateRangeDays * 24 * 60 * 60 * 1000,
        ).toISOString();
      }

      // 3. Apply default fields if configured and no fields query param provided
      let effectiveFields = query.fields ?? undefined;
      if (!query.fields && env.LANGFUSE_API_TRACES_DEFAULT_FIELDS) {
        const parsed = env.LANGFUSE_API_TRACES_DEFAULT_FIELDS.split(",")
          .map((f) => f.trim())
          .filter((f): f is TraceFieldGroup =>
            TRACE_FIELD_GROUPS.includes(f as TraceFieldGroup),
          );
        if (parsed.length > 0) {
          effectiveFields = parsed;
        }
      }

      const filterProps = {
        projectId: auth.scope.projectId,
        page: query.page ?? undefined,
        limit: query.limit ?? undefined,
        fields: effectiveFields,
        userId: query.userId ?? undefined,
        name: query.name ?? undefined,
        tags: query.tags ?? undefined,
        environment: query.environment ?? undefined,
        sessionId: query.sessionId ?? undefined,
        version: query.version ?? undefined,
        release: query.release ?? undefined,
        fromTimestamp: effectiveFromTimestamp,
        toTimestamp: query.toTimestamp ?? undefined,
      };

      // Use events table if query parameter is explicitly set, otherwise use environment variable
      const useEventsTable =
        query.useEventsTable !== undefined && query.useEventsTable !== null
          ? query.useEventsTable === true
          : env.LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS === "true";

      if (useEventsTable) {
        const [items, count] = await Promise.all([
          getTracesFromEventsTableForPublicApi({
            ...filterProps,
            advancedFilters: query.filter,
            orderBy: query.orderBy ?? null,
          }),
          getTracesCountFromEventsTableForPublicApi({
            ...filterProps,
            advancedFilters: query.filter,
          }),
        ]);

        return {
          data: items.map((item) => ({
            ...item,
            externalId: null,
          })),
          meta: {
            page: query.page,
            limit: query.limit,
            totalItems: count,
            totalPages: Math.ceil(count / query.limit),
          },
        };
      }

      // Legacy code path using traces table
      const [items, count] = await Promise.all([
        generateTracesForPublicApi({
          props: filterProps,
          advancedFilters: query.filter,
          orderBy: query.orderBy ?? null,
        }),
        getTracesCountForPublicApi({
          props: filterProps,
          advancedFilters: query.filter,
        }),
      ]);

      const finalCount = count || 0;
      return {
        data: items.map((item) => ({
          ...item,
          externalId: null,
        })),
        meta: {
          page: query.page,
          limit: query.limit,
          totalItems: finalCount,
          totalPages: Math.ceil(finalCount / query.limit),
        },
      };
    },
  }),

  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Multiple Traces",
    bodySchema: DeleteTracesV1Body,
    responseSchema: DeleteTracesV1Response,
    rateLimitResource: "trace-delete",
    fn: async ({ body, auth }) => {
      const { traceIds } = body;

      await Promise.all(
        traceIds.map((traceId) =>
          auditLog({
            resourceType: "trace",
            resourceId: traceId,
            action: "delete",
            projectId: auth.scope.projectId,
            apiKeyId: auth.scope.apiKeyId,
            orgId: auth.scope.orgId,
          }),
        ),
      );

      await traceDeletionProcessor(auth.scope.projectId, traceIds);

      return { message: "Traces deleted successfully" };
    },
  }),
});
