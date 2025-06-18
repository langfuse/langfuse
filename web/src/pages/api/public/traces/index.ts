import {
  PostTracesV1Body,
  GetTracesV1Query,
  GetTracesV1Response,
  PostTracesV1Response,
  DeleteTracesV1Body,
  DeleteTracesV1Response,
} from "@/src/features/public-api/types/traces";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { processEventBatch } from "@langfuse/shared/src/server";
import {
  eventTypes,
  logger,
  QueueJobs,
  TraceDeleteQueue,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { telemetry } from "@/src/features/telemetry";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import {
  generateTracesForPublicApi,
  getTracesCountForPublicApi,
} from "@/src/features/public-api/server/traces";

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
      const filterProps = {
        projectId: auth.scope.projectId,
        page: query.page ?? undefined,
        limit: query.limit ?? undefined,
        userId: query.userId ?? undefined,
        name: query.name ?? undefined,
        tags: query.tags ?? undefined,
        environment: query.environment ?? undefined,
        sessionId: query.sessionId ?? undefined,
        version: query.version ?? undefined,
        release: query.release ?? undefined,
        fromTimestamp: query.fromTimestamp ?? undefined,
        toTimestamp: query.toTimestamp ?? undefined,
        fields: query.fields ?? undefined,
      };

      const [items, count] = await Promise.all([
        generateTracesForPublicApi({
          props: filterProps,
          orderBy: query.orderBy ?? null,
        }),
        getTracesCountForPublicApi({ props: filterProps }),
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
    fn: async ({ body, auth }) => {
      const { traceIds } = body;

      const traceDeleteQueue = TraceDeleteQueue.getInstance();
      if (!traceDeleteQueue) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "TraceDeleteQueue not initialized",
        });
      }

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

      await traceDeleteQueue.add(QueueJobs.TraceDelete, {
        timestamp: new Date(),
        id: randomUUID(),
        payload: {
          projectId: auth.scope.projectId,
          traceIds: traceIds,
        },
        name: QueueJobs.TraceDelete,
      });

      return { message: "Traces deleted successfully" };
    },
  }),
});
