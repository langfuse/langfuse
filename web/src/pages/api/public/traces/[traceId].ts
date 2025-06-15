import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { transformDbToApiObservation } from "@/src/features/public-api/types/observations";
import {
  GetTraceV1Query,
  GetTraceV1Response,
  DeleteTraceV1Query,
  DeleteTraceV1Response,
} from "@/src/features/public-api/types/traces";
import {
  filterAndValidateDbTraceScoreList,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  getObservationsForTrace,
  getScoresForTraces,
  getTraceById,
  traceException,
  QueueJobs,
  TraceDeleteQueue,
} from "@langfuse/shared/src/server";
import Decimal from "decimal.js";
import { randomUUID } from "crypto";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { TRPCError } from "@trpc/server";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Single Trace",
    querySchema: GetTraceV1Query,
    responseSchema: GetTraceV1Response,
    fn: async ({ query, auth }) => {
      const { traceId } = query;
      const trace = await getTraceById({
        traceId,
        projectId: auth.scope.projectId,
      });

      if (!trace) {
        throw new LangfuseNotFoundError(
          `Trace ${traceId} not found within authorized project`,
        );
      }

      const [observations, scores] = await Promise.all([
        getObservationsForTrace({
          traceId,
          projectId: auth.scope.projectId,
          timestamp: trace?.timestamp,
          includeIO: true,
        }),
        getScoresForTraces({
          projectId: auth.scope.projectId,
          traceIds: [traceId],
          timestamp: trace?.timestamp,
        }),
      ]);

      const uniqueModels: string[] = Array.from(
        new Set(
          observations
            .map((r) => r.internalModelId)
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
        const model = models.find((m) => m.id === o.internalModelId);
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
      // As these are traces scores, we expect all scores to have a traceId set
      // For type consistency, we validate the scores against the v1 schema which requires a traceId
      const validatedScores = filterAndValidateDbTraceScoreList({
        scores,
        onParseError: traceException,
      });

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
        externalId: null,
        scores: validatedScores,
        latency: latencyMs !== undefined ? latencyMs / 1000 : 0,
        observations: outObservations,
        htmlPath: `/project/${auth.scope.projectId}/traces/${traceId}`,
        totalCost: outObservations
          .reduce(
            (acc, obs) => acc.add(obs.calculatedTotalCost ?? new Decimal(0)),
            new Decimal(0),
          )
          .toNumber(),
      };
    },
  }),

  DELETE: createAuthedProjectAPIRoute({
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
});
