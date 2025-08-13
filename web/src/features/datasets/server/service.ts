import {
  filterAndValidateDbScoreList,
  type PrismaClient,
  type DatasetRunItems,
  optionalPaginationZod,
} from "@langfuse/shared";
import { z } from "zod/v4";
import {
  getLatencyAndTotalCostForObservations,
  getLatencyAndTotalCostForObservationsByTraces,
  getObservationsById,
  getScoresForTraces,
  getTracesByIds,
  traceException,
} from "@langfuse/shared/src/server";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import Decimal from "decimal.js";

export const datasetRunsTableSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  runIds: z.array(z.string()).optional(),
  ...optionalPaginationZod,
});

export type DatasetRunsTableInput = z.infer<typeof datasetRunsTableSchema>;

export type DatasetRunItemsTableInput = {
  projectId: string;
  datasetId: string;
  limit: number;
  page: number;
  prisma: PrismaClient;
};

export const fetchDatasetItems = async (input: DatasetRunItemsTableInput) => {
  const dataset = await input.prisma.dataset.findUnique({
    where: {
      id_projectId: {
        id: input.datasetId,
        projectId: input.projectId,
      },
    },
    include: {
      datasetItems: {
        orderBy: [
          {
            status: "asc",
          },
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        take: input.limit,
        skip: input.page * input.limit,
      },
    },
  });
  const datasetItems = dataset?.datasetItems ?? [];

  const totalDatasetItems = await input.prisma.datasetItem.count({
    where: {
      dataset: {
        id: input.datasetId,
        projectId: input.projectId,
      },
      projectId: input.projectId,
    },
  });

  // check in clickhouse if the traces already exist. They arrive delayed.
  const traces = await getTracesByIds(
    datasetItems
      .map((item) => item.sourceTraceId)
      .filter((id): id is string => Boolean(id)),
    input.projectId,
  );

  const observations = await getObservationsById(
    datasetItems
      .map((item) => item.sourceObservationId)
      .filter((id): id is string => Boolean(id)),
    input.projectId,
  );

  const tracingData = {
    traceIds: traces.map((t) => t.id),
    observationIds: observations.map((o) => ({
      id: o.id,
      traceId: o.traceId,
    })),
  };

  return {
    totalDatasetItems,
    datasetItems: datasetItems.map((item) => {
      if (!item.sourceTraceId) {
        return {
          ...item,
          sourceTraceId: null,
          sourceObservationId: null,
        };
      }
      const traceIdExists = tracingData.traceIds.includes(item.sourceTraceId);
      const observationIdExists = tracingData.observationIds.some(
        (obs) =>
          obs.id === item.sourceObservationId &&
          obs.traceId === item.sourceTraceId,
      );

      if (observationIdExists) {
        return {
          ...item,
          sourceTraceId: item.sourceTraceId,
          sourceObservationId: item.sourceObservationId,
        };
      } else if (traceIdExists) {
        return {
          ...item,
          sourceTraceId: item.sourceTraceId,
          sourceObservationId: null,
        };
      } else {
        return {
          ...item,
          sourceTraceId: null,
          sourceObservationId: null,
        };
      }
    }),
  };
};

export const getRunItemsByRunIdOrItemId = async (
  projectId: string,
  runItems: DatasetRunItems[],
) => {
  const minTimestamp = runItems
    .map((ri) => ri.createdAt)
    .sort((a, b) => a.getTime() - b.getTime())
    .shift();
  // We assume that all events started at most 24h before the earliest run item.
  const filterTimestamp = minTimestamp
    ? new Date(minTimestamp.getTime() - 24 * 60 * 60 * 1000)
    : undefined;
  const [traceScores, observationAggregates, traceAggregate] =
    await Promise.all([
      getScoresForTraces({
        projectId,
        traceIds: runItems.map((ri) => ri.traceId),
        timestamp: filterTimestamp,
        includeHasMetadata: true,
        excludeMetadata: true,
      }),
      getLatencyAndTotalCostForObservations(
        projectId,
        runItems
          .filter((ri) => ri.observationId !== null)
          .map((ri) => ri.observationId) as string[],
        filterTimestamp,
      ),
      getLatencyAndTotalCostForObservationsByTraces(
        projectId,
        runItems.map((ri) => ri.traceId),
        filterTimestamp,
      ),
    ]);

  const validatedTraceScores = filterAndValidateDbScoreList({
    scores: traceScores,
    includeHasMetadata: true,
    onParseError: traceException,
  });

  return runItems.map((ri) => {
    const trace = traceAggregate
      .map((t) => ({
        id: t.traceId,
        duration: t.latency,
        totalCost: t.totalCost,
      }))
      .find((t) => t.id === ri.traceId) ?? {
      // we default to the traceId provided. The traceId must not be missing.
      id: ri.traceId,
      totalCost: 0,
      duration: 0,
    };

    const observation =
      observationAggregates
        .map((o) => ({
          id: o.id,
          latency: o.latency,
          calculatedTotalCost: new Decimal(o.totalCost),
        }))
        .find((o) => o.id === ri.observationId) ??
      (ri.observationId
        ? // we default to the observationId provided. The observationId must not be missing
          // in case it is on the dataset run item.
          {
            id: ri.observationId,
            calculatedTotalCost: new Decimal(0),
            latency: 0,
          }
        : undefined);

    const scores = aggregateScores([
      ...validatedTraceScores.filter((s) => s.traceId === ri.traceId),
    ]);

    return {
      id: ri.id,
      createdAt: ri.createdAt,
      datasetItemId: ri.datasetItemId,
      observation,
      trace,
      scores,
    };
  });
};
