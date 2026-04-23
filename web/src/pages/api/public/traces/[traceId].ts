import { createAuthedProjectAPIRoute } from "@/src/features/public-api/server/createAuthedProjectAPIRoute";
import { withMiddlewares } from "@/src/features/public-api/server/withMiddlewares";
import { transformDbToApiObservation } from "@/src/features/public-api/types/observations";
import {
  GetTraceV1Query,
  GetTraceV1Response,
  DeleteTraceV1Query,
  DeleteTraceV1Response,
  TRACE_FIELD_GROUPS,
  type TraceFieldGroup,
} from "@/src/features/public-api/types/traces";
import { env } from "@/src/env.mjs";
import {
  filterAndValidateDbTraceScoreList,
  LangfuseNotFoundError,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import {
  getObservationsForTrace,
  getScoresForTraces,
  getTraceById,
  getTraceByIdFromEventsTable,
  getObservationsForTraceFromEventsTable,
  traceException,
  traceDeletionProcessor,
  type ObservationPriceFields,
} from "@langfuse/shared/src/server";
import type { Observation, EventsObservation } from "@langfuse/shared";
import Decimal from "decimal.js";
import { auditLog } from "@/src/features/audit-logs/auditLog";
import { shouldUseEventsTable } from "@/src/features/public-api/server/useEventsTable";

export default withMiddlewares({
  GET: createAuthedProjectAPIRoute({
    name: "Get Single Trace",
    querySchema: GetTraceV1Query,
    responseSchema: GetTraceV1Response,
    fn: async ({ query, auth }) => {
      const { traceId } = query;

      const useEventsTable = shouldUseEventsTable({
        queryParam: query.useEventsTable,
        orgCreatedAt: auth.scope.orgCreatedAt,
      });

      let effectiveFields: readonly TraceFieldGroup[] =
        query.fields ?? TRACE_FIELD_GROUPS;
      if (!query.fields && env.LANGFUSE_API_TRACEBYID_DEFAULT_FIELDS) {
        const parsed = env.LANGFUSE_API_TRACEBYID_DEFAULT_FIELDS.split(",")
          .map((f) => f.trim())
          .filter((f): f is TraceFieldGroup =>
            TRACE_FIELD_GROUPS.includes(f as TraceFieldGroup),
          );
        if (parsed.length > 0) {
          effectiveFields = parsed;
        }
      }
      const requestedFields = effectiveFields;
      const includeIO = requestedFields.includes("io");
      const includeObservations = requestedFields.includes("observations");
      const includeScores = requestedFields.includes("scores");
      const includeMetrics = requestedFields.includes("metrics");

      const trace = useEventsTable
        ? await getTraceByIdFromEventsTable({
            traceId,
            projectId: auth.scope.projectId,
            clickhouseFeatureTag: "tracing-public-api",
            preferredClickhouseService: "ReadOnly",
            renderingProps: {
              truncated: !includeIO,
              shouldJsonParse: true,
            },
          })
        : await getTraceById({
            traceId,
            projectId: auth.scope.projectId,
            clickhouseFeatureTag: "tracing-public-api",
            preferredClickhouseService: "ReadOnly",
            excludeInputOutput: !includeIO,
            excludeMetadata: !includeIO,
          });

      if (!trace) {
        throw new LangfuseNotFoundError(
          `Trace ${traceId} not found within authorized project`,
        );
      }

      // Fetch observations and scores in parallel.
      // Events path: already enriched with model data, strip events-only fields.
      // Legacy path: manual Prisma model lookup for pricing after fetch.
      type ApiObservation = (Observation | EventsObservation) &
        ObservationPriceFields;

      const fetchObservations = async (): Promise<ApiObservation[]> => {
        if (!(includeObservations || includeMetrics)) return [];

        if (useEventsTable) {
          const { observations: eventsObs } =
            await getObservationsForTraceFromEventsTable({
              traceId,
              projectId: auth.scope.projectId,
              timestamp: trace?.timestamp,
              selectIOAndMetadata: includeObservations,
            });
          return eventsObs.map(
            ({
              traceTimestamp: _tt,
              toolDefinitionsCount: _tdc,
              toolCallsCount: _tcc,
              ...obs
            }) => obs,
          );
        }

        const legacyObs = await getObservationsForTrace({
          traceId,
          projectId: auth.scope.projectId,
          timestamp: trace?.timestamp,
          includeIO: includeObservations,
          preferredClickhouseService: "ReadOnly",
        });

        const uniqueModels = Array.from(
          new Set(
            legacyObs
              .map((r) => r.internalModelId)
              .filter((id): id is string => !!id),
          ),
        );

        const models =
          uniqueModels.length > 0
            ? await prisma.model.findMany({
                where: {
                  id: { in: uniqueModels },
                  OR: [
                    { projectId: auth.scope.projectId },
                    { projectId: null },
                  ],
                },
                include: { Price: true },
              })
            : [];

        return legacyObs.map((o) => {
          const model = models.find((m) => m.id === o.internalModelId);
          return {
            ...o,
            inputPrice:
              model?.Price.find((p) => p.usageType === "input")?.price ??
              new Decimal(0),
            outputPrice:
              model?.Price.find((p) => p.usageType === "output")?.price ??
              new Decimal(0),
            totalPrice:
              model?.Price.find((p) => p.usageType === "total")?.price ??
              new Decimal(0),
          };
        });
      };

      const [observationsView, scores] = await Promise.all([
        fetchObservations(),
        includeScores
          ? getScoresForTraces({
              projectId: auth.scope.projectId,
              traceIds: [traceId],
              timestamp: trace?.timestamp,
              preferredClickhouseService: "ReadOnly",
            })
          : Promise.resolve([]),
      ]);

      const outObservations = observationsView.map(transformDbToApiObservation);
      const validatedScores = filterAndValidateDbTraceScoreList({
        scores,
        onParseError: traceException,
      });

      const obsStartTimes = observationsView
        .map((o) => o.startTime)
        .sort((a, b) => a.getTime() - b.getTime());
      const obsEndTimes = observationsView
        .map((o) => o.endTime)
        .filter((t): t is Date => !!t)
        .sort((a, b) => a.getTime() - b.getTime());

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
        ...(includeIO ? {} : { input: null, output: null, metadata: {} }),
        externalId: null,
        scores: includeScores ? validatedScores : [],
        latency: includeMetrics
          ? latencyMs !== undefined
            ? latencyMs / 1000
            : 0
          : -1,
        observations: includeObservations ? outObservations : [],
        htmlPath: `/project/${auth.scope.projectId}/traces/${traceId}`,
        totalCost: includeMetrics
          ? outObservations
              .reduce(
                (acc, obs) =>
                  acc.add(obs.calculatedTotalCost ?? new Decimal(0)),
                new Decimal(0),
              )
              .toNumber()
          : -1,
      };
    },
  }),

  DELETE: createAuthedProjectAPIRoute({
    name: "Delete Single Trace",
    querySchema: DeleteTraceV1Query,
    responseSchema: DeleteTraceV1Response,
    rateLimitResource: "trace-delete",
    fn: async ({ query, auth }) => {
      const { traceId } = query;

      await auditLog({
        resourceType: "trace",
        resourceId: traceId,
        action: "delete",
        projectId: auth.scope.projectId,
        apiKeyId: auth.scope.apiKeyId,
        orgId: auth.scope.orgId,
      });

      await traceDeletionProcessor(auth.scope.projectId, [traceId]);

      return { message: "Trace deleted successfully" };
    },
  }),
});
