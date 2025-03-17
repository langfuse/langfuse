import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { transformDbToApiObservation } from "@/src/features/public-api/types/observations";
import {
  GetTraceV1Query,
  GetTraceV1Response,
  DeleteTraceV1Query,
  DeleteTraceV1Response,
  PatchTraceV1Query,
  PatchTraceV1Body,
  PatchTraceV1Response,
} from "@/src/features/public-api/types/traces";
import {
  filterAndValidateDbScoreList,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  getObservationsViewForTrace,
  getScoresForTraces,
  getTraceById,
  traceException,
  QueueJobs,
  TraceDeleteQueue,
  upsertTrace,
  convertTraceDomainToClickhouse,
} from "@langfuse/shared/src/server";
import Decimal from "decimal.js";
import { randomUUID } from "crypto";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { TRPCError } from "@trpc/server";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Single Trace",
    querySchema: GetTraceV1Query,
    responseSchema: GetTraceV1Response,
    fn: async ({ query, auth }) => {
      const { traceId } = query;
      const trace = await getTraceById(traceId, auth.scope.projectId);
      const [observations, scores] = await Promise.all([
        getObservationsViewForTrace(
          traceId,
          auth.scope.projectId,
          trace?.timestamp,
          true,
        ),
        getScoresForTraces({
          projectId: auth.scope.projectId,
          traceIds: [traceId],
          timestamp: trace?.timestamp,
        }),
      ]);

      const uniqueModels: string[] = Array.from(
        new Set(
          observations
            .map((r) => r.modelId)
            .filter((r): r is string => Boolean(r)),
        ),
      );

      const models =
        uniqueModels.length > 0
          ? await prisma.model.findMany({
              where: {
                id: {
                  in: uniqueModels,
                },
                OR: [{ projectId: auth.scope.projectId }, { projectId: null }],
              },
              include: {
                Price: true,
              },
            })
          : [];

      const observationsView = observations.map((o) => {
        const model = models.find((m) => m.id === o.modelId);
        const inputPrice =
          model?.Price.find((p) => p.usageType === "input")?.price ??
          new Decimal(0);
        const outputPrice =
          model?.Price.find((p) => p.usageType === "output")?.price ??
          new Decimal(0);
        const totalPrice =
          model?.Price.find((p) => p.usageType === "total")?.price ??
          new Decimal(0);
        return {
          ...o,
          inputPrice,
          outputPrice,
          totalPrice,
        };
      });

      if (!trace) {
        throw new LangfuseNotFoundError(
          `Trace ${traceId} not found within authorized project`,
        );
      }

      const outObservations = observationsView.map(transformDbToApiObservation);
      const validatedScores = filterAndValidateDbScoreList(
        scores,
        traceException,
      );

      const obsStartTimes = observations
        .map((o) => o.startTime)
        .sort((a, b) => a.getTime() - b.getTime());
      const obsEndTimes = observations
        .map((o) => o.endTime)
        .filter((t) => t)
        .sort((a, b) => (a as Date).getTime() - (b as Date).getTime());

      const latencyMs =
        obsStartTimes.length > 0
          ? obsEndTimes.length > 0
            ? (obsEndTimes[obsEndTimes.length - 1] as Date).getTime() -
              obsStartTimes[0]!.getTime()
            : obsStartTimes.length > 1
              ? obsStartTimes[obsStartTimes.length - 1]!.getTime() -
                obsStartTimes[0]!.getTime()
              : undefined
          : undefined;
      return {
        ...trace,
        scores: validatedScores,
        latency: latencyMs !== undefined ? latencyMs / 1000 : 0,
        observations: outObservations,
        htmlPath: `/project/${auth.scope.projectId}/traces/${traceId}`,
        totalCost: observations
          .reduce(
            (acc, obs) => acc.add(obs.calculatedTotalCost ?? new Decimal(0)),
            new Decimal(0),
          )
          .toNumber(),
      };
    },
  }),

  DELETE: createAuthedAPIRoute({
    name: "Delete Single Trace",
    querySchema: DeleteTraceV1Query,
    responseSchema: DeleteTraceV1Response,
    fn: async ({ query, auth }) => {
      const { traceId } = query;

      const traceDeleteQueue = TraceDeleteQueue.getInstance();
      if (!traceDeleteQueue) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "TraceDeleteQueue not initialized",
        });
      }

      await auditLog({
        resourceType: "trace",
        resourceId: traceId,
        action: "delete",
        projectId: auth.scope.projectId,
        apiKeyId: auth.scope.apiKeyId,
        orgId: auth.scope.orgId,
      });

      // Add to delete queue
      await traceDeleteQueue.add(QueueJobs.TraceDelete, {
        timestamp: new Date(),
        id: randomUUID(),
        payload: {
          projectId: auth.scope.projectId,
          traceIds: [traceId],
        },
        name: QueueJobs.TraceDelete,
      });

      return { message: "Trace deleted successfully" };
    },
  }),

  PATCH: createAuthedAPIRoute({
    name: "Update Single Trace",
    querySchema: PatchTraceV1Query,
    bodySchema: PatchTraceV1Body,
    responseSchema: PatchTraceV1Response,
    fn: async ({ query, body, auth }) => {
      const { traceId } = query;
      
      // Get the trace to update
      const trace = await getTraceById(traceId, auth.scope.projectId);
      
      if (!trace) {
        throw new LangfuseNotFoundError(
          `Trace ${traceId} not found within authorized project`
        );
      }

      // Log audit entries for each updated field
      const updates = [];
      
      if (body.bookmarked !== undefined && trace.bookmarked !== body.bookmarked) {
        updates.push("bookmarked");
        await auditLog({
          resourceType: "trace",
          resourceId: traceId,
          action: "bookmark",
          after: body.bookmarked,
          projectId: auth.scope.projectId,
          apiKeyId: auth.scope.apiKeyId,
          orgId: auth.scope.orgId,
        });
        trace.bookmarked = body.bookmarked;
      }
      
      if (body.public !== undefined && trace.public !== body.public) {
        updates.push("public");
        await auditLog({
          resourceType: "trace",
          resourceId: traceId,
          action: "publish",
          after: body.public,
          projectId: auth.scope.projectId,
          apiKeyId: auth.scope.apiKeyId,
          orgId: auth.scope.orgId,
        });
        trace.public = body.public;
      }
      
      if (body.tags !== undefined && JSON.stringify(trace.tags) !== JSON.stringify(body.tags)) {
        updates.push("tags");
        await auditLog({
          resourceType: "trace",
          resourceId: traceId,
          action: "updateTags",
          after: body.tags,
          projectId: auth.scope.projectId,
          apiKeyId: auth.scope.apiKeyId,
          orgId: auth.scope.orgId,
        });
        trace.tags = body.tags;
      }

      // Only update if changes were made
      if (updates.length > 0) {
        await upsertTrace(convertTraceDomainToClickhouse(trace));
      }

      // Now fetch the updated trace with all details to return
      const [observations, scores] = await Promise.all([
        getObservationsViewForTrace(
          traceId,
          auth.scope.projectId,
          trace?.timestamp,
          true,
        ),
        getScoresForTraces({
          projectId: auth.scope.projectId,
          traceIds: [traceId],
          timestamp: trace?.timestamp,
        }),
      ]);

      const uniqueModels: string[] = Array.from(
        new Set(
          observations
            .map((r) => r.modelId)
            .filter((r): r is string => Boolean(r)),
        ),
      );

      const models =
        uniqueModels.length > 0
          ? await prisma.model.findMany({
              where: {
                id: {
                  in: uniqueModels,
                },
                OR: [{ projectId: auth.scope.projectId }, { projectId: null }],
              },
              include: {
                Price: true,
              },
            })
          : [];

      const observationsView = observations.map((o) => {
        const model = models.find((m) => m.id === o.modelId);
        const inputPrice =
          model?.Price.find((p) => p.usageType === "input")?.price ??
          new Decimal(0);
        const outputPrice =
          model?.Price.find((p) => p.usageType === "output")?.price ??
          new Decimal(0);
        const totalPrice =
          model?.Price.find((p) => p.usageType === "total")?.price ??
          new Decimal(0);
        return {
          ...o,
          inputPrice,
          outputPrice,
          totalPrice,
        };
      });

      const outObservations = observationsView.map(transformDbToApiObservation);
      const validatedScores = filterAndValidateDbScoreList(
        scores,
        traceException,
      );

      const obsStartTimes = observations
        .map((o) => o.startTime)
        .sort((a, b) => a.getTime() - b.getTime());
      const obsEndTimes = observations
        .map((o) => o.endTime)
        .filter((t) => t)
        .sort((a, b) => (a as Date).getTime() - (b as Date).getTime());

      const latencyMs =
        obsStartTimes.length > 0
          ? obsEndTimes.length > 0
            ? (obsEndTimes[obsEndTimes.length - 1] as Date).getTime() -
              obsStartTimes[0]!.getTime()
            : obsStartTimes.length > 1
              ? obsStartTimes[obsStartTimes.length - 1]!.getTime() -
                obsStartTimes[0]!.getTime()
              : undefined
          : undefined;
      
      return {
        ...trace,
        scores: validatedScores,
        latency: latencyMs !== undefined ? latencyMs / 1000 : 0,
        observations: outObservations,
        htmlPath: `/project/${auth.scope.projectId}/traces/${traceId}`,
        totalCost: observations
          .reduce(
            (acc, obs) => acc.add(obs.calculatedTotalCost ?? new Decimal(0)),
            new Decimal(0),
          )
          .toNumber(),
      };
    },
  }),
});
