import {
  filterAndValidateDbScoreList,
  type PrismaClient,
  optionalPaginationZod,
  type FilterState,
  type DatasetItem,
  type TracingSearchType,
  singleFilter,
  type DatasetRunItemDomain,
  AGGREGATABLE_SCORE_TYPES,
} from "@langfuse/shared";
import { z } from "zod/v4";
import {
  type EnrichedDatasetRunItem,
  getLatencyAndTotalCostForObservationsByTraces,
  getObservationsGroupedByTraceId,
  getScoresForTraces,
  traceException,
  getDatasetItems,
  getDatasetItemsCount,
} from "@langfuse/shared/src/server";
import Decimal from "decimal.js";
import groupBy from "lodash/groupBy";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { calculateRecursiveMetricsForRunItems } from "./utils";

export const datasetRunsTableSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  filter: z.array(singleFilter),
  ...optionalPaginationZod,
});

export const datasetRunTableMetricsSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  runIds: z.array(z.string()),
  filter: z.array(singleFilter),
});

export type DatasetRunsTableInput = z.infer<typeof datasetRunsTableSchema>;
export type DatasetRunTableMetricsInput = z.infer<
  typeof datasetRunTableMetricsSchema
>;

export type DatasetRunItemsTableInput = {
  projectId: string;
  datasetId: string;
  limit: number;
  page: number;
  prisma: PrismaClient;
  filter: FilterState;
  version?: Date;
  searchQuery?: string;
  searchType?: TracingSearchType[];
};

export const fetchDatasetItems = async (input: DatasetRunItemsTableInput) => {
  // Add dataset ID filter to existing FilterState
  const filterState: FilterState = [
    ...input.filter,
    {
      type: "stringOptions",
      column: "datasetId",
      operator: "any of",
      value: [input.datasetId],
    },
  ];

  const [datasetItems, totalCount] = await Promise.all([
    getDatasetItems({
      projectId: input.projectId,
      filterState,
      version: input.version,
      searchQuery: input.searchQuery,
      searchType: input.searchType,
      limit: input.limit,
      page: input.page,
    }),
    getDatasetItemsCount({
      projectId: input.projectId,
      filterState,
      version: input.version,
      searchQuery: input.searchQuery,
      searchType: input.searchType,
    }),
  ]);

  return {
    totalDatasetItems: totalCount,
    datasetItems: datasetItems as DatasetItem[],
  };
};

export const getRunItemsByRunIdOrItemId = async <WithIO extends boolean = true>(
  projectId: string,
  runItems: DatasetRunItemDomain<WithIO>[],
  fromTimestamp?: Date,
): Promise<EnrichedDatasetRunItem[]> => {
  const minTimestamp =
    fromTimestamp ??
    runItems
      .map((ri) => ri.createdAt)
      .sort((a, b) => a.getTime() - b.getTime())
      .shift();
  // We assume that all events started at most 24h before the earliest run item.
  const filterTimestamp = minTimestamp
    ? new Date(minTimestamp.getTime() - 24 * 60 * 60 * 1000)
    : undefined;
  const traceIds = runItems.map((ri) => ri.traceId);
  const observationLevelRunItems = runItems.filter(
    (ri) => ri.observationId !== null,
  );

  const [traceScores, observationsByTraceId, traceAggregate] =
    await Promise.all([
      getScoresForTraces({
        projectId,
        traceIds,
        timestamp: filterTimestamp,
        includeHasMetadata: true,
        excludeMetadata: true,
      }),
      getObservationsGroupedByTraceId(
        projectId,
        observationLevelRunItems.map((ri) => ri.traceId),
        filterTimestamp,
      ),
      getLatencyAndTotalCostForObservationsByTraces(
        projectId,
        traceIds,
        filterTimestamp,
      ),
    ]);

  // Calculate recursive metrics for observation-level run items
  const observationAggregates = calculateRecursiveMetricsForRunItems<WithIO>(
    observationLevelRunItems,
    observationsByTraceId,
  );

  const validatedTraceScores = filterAndValidateDbScoreList({
    scores: traceScores,
    dataTypes: AGGREGATABLE_SCORE_TYPES,
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
      datasetItemVersion: ri.datasetItemVersion ?? undefined,
      datasetRunId: ri.datasetRunId,
      datasetRunName: ri.datasetRunName,
      observation,
      trace,
      scores,
    };
  });
};

export const enrichAndMapToDatasetItemId = async (
  projectId: string,
  datasetRunItems: DatasetRunItemDomain<false>[],
): Promise<Map<string, Record<string, EnrichedDatasetRunItem>>> => {
  // Step 1: Group by dataset run id
  const runItemsByRunId = groupBy(datasetRunItems, "datasetRunId");

  // Step 2: Parallel enrichment per run (with timestamp)
  const enrichmentPromises = Object.entries(runItemsByRunId).map(
    async ([_runId, items]) => {
      const timestamp = items[0].datasetRunCreatedAt;
      const enriched = await getRunItemsByRunIdOrItemId<false>(
        projectId,
        items,
        timestamp,
      );
      return enriched;
    },
  );
  const enrichedRunItems = await Promise.all(enrichmentPromises);

  // Step 3: Group by dataset item ID -> Record of runId -> enriched data
  const result: Map<string, Record<string, EnrichedDatasetRunItem>> = new Map();

  enrichedRunItems.flat().forEach((enrichedItem) => {
    if (!result.has(enrichedItem.datasetItemId)) {
      result.set(enrichedItem.datasetItemId, {});
    }

    result.get(enrichedItem.datasetItemId)![enrichedItem.datasetRunId] =
      enrichedItem;
  });

  return result;
};
