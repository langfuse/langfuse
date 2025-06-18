import {
  filterAndValidateDbScoreList,
  Prisma,
  type PrismaClient,
  type DatasetRunItems,
  optionalPaginationZod,
} from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { z } from "zod/v4";
import {
  clickhouseClient,
  clickhouseCompliantRandomCharacters,
  commandClickhouse,
  convertToScore,
  getLatencyAndTotalCostForObservations,
  getLatencyAndTotalCostForObservationsByTraces,
  getObservationsById,
  getScoresForDatasetRuns,
  getScoresForTraces,
  getTracesByIds,
  logger,
  queryClickhouse,
  type ScoreRecordReadType,
  traceException,
} from "@langfuse/shared/src/server";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import Decimal from "decimal.js";
import { env } from "@/src/env.mjs";

export const datasetRunsTableSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  runIds: z.array(z.string()).optional(),
  ...optionalPaginationZod,
});

type PostgresRunItem = {
  trace_id: string;
  observation_id: string;
  ri_id: string;
};

type PostgresDatasetRun = {
  run_id: string;
  run_name: string;
  run_description: string;
  run_metadata: Prisma.JsonValue;
  run_created_at: Date;
  run_updated_at: Date;
  run_items: PostgresRunItem[];
};

export type DatasetRunsTableInput = z.infer<typeof datasetRunsTableSchema>;

export const createDatasetRunsTableWithoutMetrics = async (
  input: DatasetRunsTableInput,
) => {
  const runs = await getDatasetRunsFromPostgres(input);

  return runs.map(({ run_items, ...run }) => ({
    ...run,
    projectId: input.projectId,
    datasetId: input.datasetId,
    id: run.run_id,
    countRunItems: run_items.length,
    name: run.run_name,
    description: run.run_description,
    metadata: run.run_metadata,
    createdAt: run.run_created_at,
    updatedAt: run.run_updated_at,
    // return metric fields as undefined
    avgTotalCost: undefined as Decimal | undefined,
    avgLatency: undefined as number | undefined,
    scores: undefined,
  }));
};

// we might have many traces / observations in Postgres which belong to data in clickhouse.
// We need to create a temp table in CH, dump the data in there, and then join in CH.
export const createDatasetRunsTable = async (input: DatasetRunsTableInput) => {
  const tableName = `dataset_runs_${clickhouseCompliantRandomCharacters()}`;
  try {
    const runs = await getDatasetRunsFromPostgres(input);

    await createTempTableInClickhouse(tableName);
    await insertPostgresDatasetRunsIntoClickhouse(
      runs,
      tableName,
      input.projectId,
      input.datasetId,
    );

    // these calls need to happen sequentially as there can be only one active session with
    // the same session_id at the time.
    const traceScores = await getTraceScoresFromTempTable(input, tableName);

    const runScores = await getScoresForDatasetRuns({
      projectId: input.projectId,
      runIds: runs.map((r) => r.run_id),
      includeHasMetadata: true,
      excludeMetadata: false,
    });

    const obsAgg = await getObservationLatencyAndCostForDataset(
      input,
      tableName,
    );
    const traceAgg = await getTraceLatencyAndCostForDataset(input, tableName);

    const enrichedRuns = runs.map(({ run_items, ...run }) => {
      const observation = obsAgg.find((o) => o.runId === run.run_id);
      const trace = traceAgg.find((t) => t.runId === run.run_id);
      return {
        ...run,
        projectId: input.projectId,
        datasetId: input.datasetId,
        id: run.run_id,
        avgTotalCost: trace?.cost
          ? new Decimal(trace.cost)
          : observation?.cost
            ? new Decimal(observation.cost)
            : new Decimal(0),
        countRunItems: run_items.length,
        name: run.run_name,
        description: run.run_description,
        metadata: run.run_metadata,
        createdAt: run.run_created_at,
        updatedAt: run.run_updated_at,
        avgLatency: trace?.latency ?? observation?.latency ?? 0,
        scores: aggregateScores(
          traceScores.filter((s) => s.run_id === run.run_id),
        ),
        // check this one
        runScores: aggregateScores(
          runScores.filter((s) => s.datasetRunId === run.run_id),
        ),
      };
    });

    return enrichedRuns;
  } catch (e) {
    logger.error("Failed to fetch dataset runs from clickhouse", e);
    throw e;
  } finally {
    await deleteTempTableInClickhouse(tableName);
  }
};

export const insertPostgresDatasetRunsIntoClickhouse = async (
  runs: PostgresDatasetRun[],
  tableName: string,
  projectId: string,
  datasetId: string,
) => {
  const rows = runs.flatMap((run) =>
    run.run_items.map((item) => ({
      project_id: projectId,
      run_id: run.run_id,
      run_item_id: item.ri_id,
      dataset_id: datasetId,
      trace_id: item.trace_id,
      observation_id: item.observation_id,
    })),
  );

  await clickhouseClient().insert({
    table: tableName,
    values: rows,
    format: "JSONEachRow",
    clickhouse_settings: {
      log_comment: JSON.stringify({ feature: "dataset", projectId }),
      insert_quorum_parallel: 0,
      insert_quorum: "auto",
    },
  });
};

export const createTempTableInClickhouse = async (tableName: string) => {
  const query = `
      CREATE TABLE IF NOT EXISTS ${tableName} ${env.CLICKHOUSE_CLUSTER_ENABLED === "true" ? "ON CLUSTER " + env.CLICKHOUSE_CLUSTER_NAME : ""}
      (
          project_id String,    
          run_id String,  
          run_item_id String,
          dataset_id String,      
          trace_id String,
          observation_id Nullable(String)
      )  
      ENGINE = ${env.CLICKHOUSE_CLUSTER_ENABLED === "true" ? "ReplicatedMergeTree()" : "MergeTree()"} 
      PRIMARY KEY (project_id, dataset_id, run_id, trace_id)
  `;
  await commandClickhouse({
    query,
    params: { tableName },
    tags: { feature: "dataset" },
  });
};

export const deleteTempTableInClickhouse = async (tableName: string) => {
  const query = `
      DROP TABLE IF EXISTS ${tableName} ${env.CLICKHOUSE_CLUSTER_ENABLED === "true" ? "ON CLUSTER " + env.CLICKHOUSE_CLUSTER_NAME : ""}
  `;
  await commandClickhouse({
    query,
    params: { tableName },
    tags: { feature: "dataset" },
  });
};

export const getDatasetRunsFromPostgres = async (
  input: DatasetRunsTableInput,
) => {
  return await prisma.$queryRaw<PostgresDatasetRun[]>(
    Prisma.sql`
      SELECT
        runs.id as run_id,
        runs.name as run_name,
        runs.description as run_description,
        runs.metadata as run_metadata,
        runs.created_at as run_created_at,
        runs.updated_at as run_updated_at,
        JSON_AGG(JSON_BUILD_OBJECT(
          'trace_id', ri.trace_id,
          'observation_id', ri.observation_id,
          'ri_id', ri.id
        )) AS run_items
      FROM
        datasets d
        JOIN dataset_runs runs ON d.id = runs.dataset_id AND d.project_id = runs.project_id
        LEFT JOIN dataset_run_items ri ON ri.dataset_run_id = runs.id
          AND ri.project_id = runs.project_id
      WHERE
        d.id = ${input.datasetId}
        AND d.project_id = ${input.projectId}
        ${input.runIds?.length ? Prisma.sql`AND runs.id IN (${Prisma.join(input.runIds)})` : Prisma.empty}
      GROUP BY runs.id, runs.name, runs.description, runs.metadata, runs.created_at, runs.updated_at
      ORDER BY runs.created_at DESC
      ${input.limit ? Prisma.sql`LIMIT ${input.limit}` : Prisma.empty}
      ${input.page && input.limit ? Prisma.sql`OFFSET ${input.page * input.limit}` : Prisma.empty}
    `,
  );
};

const getTraceScoresFromTempTable = async (
  input: DatasetRunsTableInput,
  tableName: string,
) => {
  // adds a setting to read data once it is replicated from the writer node.
  // Only then, we can guarantee that the created mergetree before was replicated.
  const query = `
      SELECT 
        s.* EXCEPT (metadata),
        length(mapKeys(s.metadata)) > 0 AS has_metadata,
        tmp.run_id
      FROM ${tableName} tmp JOIN scores s 
        ON tmp.project_id = s.project_id 
        AND tmp.trace_id = s.trace_id
      WHERE s.project_id = {projectId: String}
      AND tmp.project_id = {projectId: String}
      AND tmp.dataset_id = {datasetId: String}
      ORDER BY s.event_ts DESC
      LIMIT 1 BY s.id, s.project_id, tmp.run_id
  `;

  const rows = await queryClickhouse<
    ScoreRecordReadType & {
      run_id: string;
      // has_metadata is 0 or 1 from ClickHouse, later converted to a boolean
      has_metadata: 0 | 1;
    }
  >({
    query: query,
    params: {
      projectId: input.projectId,
      datasetId: input.datasetId,
    },
    clickhouseConfigs: {
      clickhouse_settings: {
        select_sequential_consistency: "1",
      },
    },
    tags: { feature: "dataset", projectId: input.projectId },
  });

  return rows.map((row) => ({
    ...convertToScore({ ...row, metadata: {} }),
    run_id: row.run_id,
    hasMetadata: !!row.has_metadata,
  }));
};

const getObservationLatencyAndCostForDataset = async (
  input: DatasetRunsTableInput,
  tableName: string,
) => {
  // the subquery here will improve performance as it allows clickhouse to use skip-indices on
  // the observations table
  const query = `
    WITH agg AS (
      SELECT
          dateDiff('millisecond', start_time, end_time) AS latency_ms,
          total_cost AS cost,
          run_id
      FROM observations AS o
      INNER JOIN ${tableName} AS tmp ON (o.id = tmp.observation_id) AND (o.project_id = tmp.project_id) AND (tmp.trace_id = o.trace_id)
      WHERE 
        o.project_id = {projectId: String}
        AND (id, trace_id) IN (
          SELECT
              observation_id,
              trace_id
          FROM ${tableName}
          WHERE (project_id = {projectId: String}) AND (dataset_id = {datasetId: String}) AND (observation_id IS NOT NULL)
        )
    )
    SELECT 
      run_id,
      avg(latency_ms) as avg_latency_ms,
      avg(cost) as avg_total_cost
    FROM agg
    GROUP BY run_id
  `;

  const rows = await queryClickhouse<{
    run_id: string;
    avg_latency_ms: string;
    avg_total_cost: string;
  }>({
    query: query,
    params: {
      projectId: input.projectId,
      datasetId: input.datasetId,
    },
    clickhouseConfigs: {
      clickhouse_settings: {
        select_sequential_consistency: "1",
      },
    },
    tags: { feature: "dataset", projectId: input.projectId ?? "" },
  });

  return rows.map((row) => ({
    runId: row.run_id,
    latency: Number(row.avg_latency_ms) / 1000,
    cost: Number(row.avg_total_cost),
  }));
};

const getTraceLatencyAndCostForDataset = async (
  input: DatasetRunsTableInput,
  tableName: string,
) => {
  const query = `
      WITH agg AS (
      SELECT
        o.trace_id,
        run_id,
        dateDiff('millisecond', min(start_time), max(end_time)) AS latency_ms,
        sum(total_cost) AS cost
      FROM observations o JOIN ${tableName} tmp
        ON tmp.project_id = o.project_id 
        AND tmp.trace_id = o.trace_id
      WHERE o.project_id = {projectId: String}
      AND tmp.project_id = {projectId: String}
      AND tmp.dataset_id = {datasetId: String}
      AND tmp.observation_id IS NULL
      GROUP BY o.trace_id, run_id
    )
    SELECT 
      run_id,
      avg(latency_ms) as avg_latency_ms,
      avg(cost) as avg_total_cost
    FROM agg
    GROUP BY run_id
  `;

  const rows = await queryClickhouse<{
    run_id: string;
    avg_latency_ms: string;
    avg_total_cost: string;
  }>({
    query: query,
    params: {
      projectId: input.projectId,
      datasetId: input.datasetId,
    },
    clickhouseConfigs: {
      clickhouse_settings: {
        select_sequential_consistency: "1",
      },
    },
    tags: { feature: "dataset", projectId: input.projectId ?? "" },
  });

  return rows.map((row) => ({
    runId: row.run_id,
    latency: Number(row.avg_latency_ms) / 1000,
    cost: Number(row.avg_total_cost),
  }));
};

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
