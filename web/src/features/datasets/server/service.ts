import {
  filterAndValidateDbScoreList,
  Prisma,
  type PrismaClient,
  type DatasetRunItems,
  optionalPaginationZod,
  type FilterState,
  datasetItemFilterColumns,
  type DatasetItem,
  type TracingSearchType,
  singleFilter,
} from "@langfuse/shared";
import { z } from "zod/v4";
import {
  getLatencyAndTotalCostForObservations,
  getLatencyAndTotalCostForObservationsByTraces,
  getScoresForTraces,
  tableColumnsToSqlFilterAndPrefix,
  traceException,
} from "@langfuse/shared/src/server";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import Decimal from "decimal.js";

export const datasetRunsTableSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  // LFE-6397: deprecated, remove runIds
  runIds: z.array(z.string()).optional(),
  // LFE-6397: remove optional
  filter: z.array(singleFilter).optional(),
  ...optionalPaginationZod,
});

export const datasetRunTableMetricsSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  // LFE-6397: remove optional
  runIds: z.array(z.string()).optional(),
  filter: z.array(singleFilter),
  // LFE-6397: deprecated, remove optional pagination
  ...optionalPaginationZod,
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
  searchQuery?: string;
  searchType?: TracingSearchType[];
};

type DatasetItemsByDatasetIdQuery = {
  select: "rows" | "count";
  projectId: string;
  datasetId: string;
  filter: FilterState;
  limit: number;
  page: number;
  searchFilter?: Prisma.Sql;
};

const generateDatasetItemQuery = ({
  select,
  projectId,
  datasetId,
  filter,
  limit,
  page,
  searchFilter = Prisma.empty,
}: DatasetItemsByDatasetIdQuery) => {
  const filterCondition = tableColumnsToSqlFilterAndPrefix(
    filter,
    datasetItemFilterColumns,
    "dataset_items",
  );

  let selectClause: Prisma.Sql;
  switch (select) {
    case "rows":
      selectClause = Prisma.sql`
      di.id as "id",
      di.project_id as "projectId",
      di.dataset_id as "datasetId",
      di.status as "status",
      di.created_at as "createdAt",
      di.updated_at as "updatedAt",
      di.source_trace_id as "sourceTraceId",
      di.source_observation_id as "sourceObservationId",
      di.input as "input",
      di.expected_output as "expectedOutput",
      di.metadata as "metadata"
      `;
      break;
    case "count":
      selectClause = Prisma.sql`count(*) AS "totalCount"`;
      break;
    default:
      throw new Error(`Unknown select type: ${select}`);
  }

  const orderByClause =
    select === "rows"
      ? Prisma.sql`
        ORDER BY di.status ASC, di.created_at DESC, di.id DESC
      `
      : Prisma.empty;

  return Prisma.sql`
  SELECT ${selectClause}
  FROM dataset_items di
  WHERE di.project_id = ${projectId}
  AND di.dataset_id = ${datasetId}
  ${filterCondition}
  ${searchFilter}
  ${orderByClause}
  LIMIT ${limit} OFFSET ${page * limit}
 `;
};

const buildDatasetItemSearchFilter = (
  searchQuery: string | undefined | null,
  searchType?: TracingSearchType[],
): Prisma.Sql => {
  if (searchQuery === undefined || searchQuery === null || searchQuery === "") {
    return Prisma.empty;
  }

  const q = searchQuery;
  const types = searchType ?? ["content"];
  const searchConditions: Prisma.Sql[] = [];

  if (types.includes("id")) {
    searchConditions.push(Prisma.sql`di.id ILIKE ${`%${q}%`}`);
  }

  if (types.includes("content")) {
    searchConditions.push(Prisma.sql`di.input::text ILIKE ${`%${q}%`}`);
    searchConditions.push(
      Prisma.sql`di.expected_output::text ILIKE ${`%${q}%`}`,
    );
    searchConditions.push(Prisma.sql`di.metadata::text ILIKE ${`%${q}%`}`);
  }

  return searchConditions.length > 0
    ? Prisma.sql` AND (${Prisma.join(searchConditions, " OR ")})`
    : Prisma.empty;
};

export const fetchDatasetItems = async (input: DatasetRunItemsTableInput) => {
  const searchFilter = buildDatasetItemSearchFilter(
    input.searchQuery,
    input.searchType,
  );

  const [datasetItems, countDatasetItems] = await Promise.all([
    // datasetItems
    input.prisma.$queryRaw<Array<DatasetItem>>(
      generateDatasetItemQuery({
        select: "rows",
        projectId: input.projectId,
        datasetId: input.datasetId,
        filter: input.filter,
        limit: input.limit,
        page: input.page,
        searchFilter,
      }),
    ),
    // countDatasetItems
    input.prisma.$queryRaw<Array<{ totalCount: bigint }>>(
      generateDatasetItemQuery({
        select: "count",
        projectId: input.projectId,
        datasetId: input.datasetId,
        filter: input.filter,
        limit: 1,
        page: 0,
        searchFilter,
      }),
    ),
  ]);

  return {
    totalDatasetItems: Number(countDatasetItems[0].totalCount),
    datasetItems: datasetItems,
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
