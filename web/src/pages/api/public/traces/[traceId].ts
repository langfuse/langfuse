import { createAuthedAPIRoute } from "@/src/features/public-api/server/createAuthedAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { transformDbToApiObservation } from "@/src/features/public-api/types/observations";
import {
  GetTraceV1Query,
  GetTraceV1Response,
} from "@/src/features/public-api/types/traces";
import { measureAndReturnApi } from "@/src/server/utils/checkClickhouseAccess";
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
} from "@langfuse/shared/src/server";
import Decimal from "decimal.js";

export default withMiddlewares({
  GET: createAuthedAPIRoute({
    name: "Get Single Trace",
    querySchema: GetTraceV1Query,
    responseSchema: GetTraceV1Response,
    fn: async ({ query, auth }) => {
      const { traceId } = query;

      return await measureAndReturnApi({
        input: { projectId: auth.scope.projectId, queryClickhouse: false },
        operation: "api/public/traces/[traceId]",
        user: null,
        pgExecution: async () => {
          const trace = await prisma.traceView.findFirst({
            where: {
              id: traceId,
              projectId: auth.scope.projectId,
            },
          });

          if (!trace) {
            throw new LangfuseNotFoundError(
              "Trace not found within authorized project",
            );
          }

          const [scores, observations] = await Promise.all([
            prisma.score.findMany({
              where: {
                traceId: traceId,
                projectId: auth.scope.projectId,
              },
              orderBy: { timestamp: "desc" },
            }),
            prisma.observationView.findMany({
              where: {
                traceId: traceId,
                projectId: auth.scope.projectId,
              },
              orderBy: { startTime: "asc" },
            }),
          ]);

          const outObservations = observations.map(transformDbToApiObservation);
          const validatedScores = filterAndValidateDbScoreList(
            scores,
            traceException,
          );

          const { duration, ...restOfTrace } = trace;

          return {
            ...restOfTrace,
            scores: validatedScores,
            htmlPath: `/project/${auth.scope.projectId}/traces/${traceId}`,
            totalCost: outObservations.reduce(
              (acc, obs) => acc + (obs.calculatedTotalCost ?? 0),
              0,
            ),
            latency: duration ?? 0,
            observations: outObservations,
          };
        },
        clickhouseExecution: async () => {
          const trace = await getTraceById(traceId, auth.scope.projectId);
          const [observations, scores] = await Promise.all([
            getObservationsViewForTrace(
              traceId,
              auth.scope.projectId,
              trace?.timestamp,
              true,
            ),
            getScoresForTraces(
              auth.scope.projectId,
              [traceId],
              trace?.timestamp,
            ),
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
                    OR: [
                      { projectId: auth.scope.projectId },
                      { projectId: null },
                    ],
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

          const outObservations = observationsView.map(
            transformDbToApiObservation,
          );
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
                (acc, obs) =>
                  acc.add(obs.calculatedTotalCost ?? new Decimal(0)),
                new Decimal(0),
              )
              .toNumber(),
          };
        },
      });
    },
  }),
});
