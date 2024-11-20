import { paginationZod, Prisma } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";
import { z } from "zod";
import {
  clickhouseClient,
  clickhouseCompliantRandomCharacters,
  commandClickhouse,
  convertToScore,
  type FetchScoresReturnType,
  logger,
  queryClickhouse,
} from "@langfuse/shared/src/server";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import Decimal from "decimal.js";

export const datasetRunsTableSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  queryClickhouse: z.boolean().optional().default(false),
  ...paginationZod,
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

// we might have many traces / observations in Postgres which belong to data in clickhouse.
// We need to create a temp table in CH, dump the data in there, and then join in CH.
export const createDatasetRunsTable = async (input: DatasetRunsTableInput) => {
  const tableName = `dataset_runs_${clickhouseCompliantRandomCharacters()}`;
  const clickhouseSession = v4();
  try {
    const runs = await getDatasetRunsFromPostgres(input);

    await createTempTableInClickhouse(tableName, clickhouseSession);
    await insertPostgresDatasetRunsIntoClickhouse(
      runs,
      tableName,
      input.projectId,
      input.datasetId,
      clickhouseSession,
    );

    // these calls need to happen sequentially as there can be only one active session with
    // the same session_id at the time.
    const scores = await getScoresFromTempTable(
      input,
      tableName,
      clickhouseSession,
    );
    const obsAgg = await getObservationLatencyAndCostForDataset(
      input,
      tableName,
      clickhouseSession,
    );
    const traceAgg = await getTraceLatencyAndCostForDataset(
      input,
      tableName,
      clickhouseSession,
    );

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
        scores: aggregateScores(scores.filter((s) => s.run_id === run.run_id)),
      };
    });

    return enrichedRuns;
  } catch (e) {
    logger.error("Failed to fetch dataset runs from clickhouse", e);
    throw e;
  } finally {
    await deleteTempTableInClickhouse(tableName, clickhouseSession);
  }
};

export const insertPostgresDatasetRunsIntoClickhouse = async (
  runs: PostgresDatasetRun[],
  tableName: string,
  projectId: string,
  datasetId: string,
  clickhouseSession: string,
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

  await clickhouseClient({ session_id: clickhouseSession }).insert({
    table: tableName,
    values: rows,
    format: "JSONEachRow",
  });
};

export const createTempTableInClickhouse = async (
  tableName: string,
  clickhouseSession: string,
) => {
  const query = `
      CREATE TEMPORARY TABLE IF NOT EXISTS ${tableName}
      (
          project_id String,    
          run_id String,  
          run_item_id String,
          dataset_id String,      
          trace_id String,
          observation_id Nullable(String)
      )  ENGINE = Memory

  `;
  await commandClickhouse({
    query,
    params: { tableName },
    clickhouseConfigs: { session_id: clickhouseSession },
  });
};

export const deleteTempTableInClickhouse = async (
  tableName: string,
  sessionId: string,
) => {
  const query = `
      DROP TABLE IF EXISTS ${tableName}
  `;
  await commandClickhouse({
    query,
    params: { tableName },
    clickhouseConfigs: { session_id: sessionId },
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
        JOIN dataset_run_items ri ON ri.dataset_run_id = runs.id
          AND ri.project_id = runs.project_id
      WHERE
        d.id = ${input.datasetId}
        AND d.project_id = ${input.projectId}
      GROUP BY runs.id, runs.name, runs.description, runs.metadata, runs.created_at, runs.updated_at
      LIMIT ${input.limit}
      OFFSET ${input.page * input.limit}
    `,
  );
};

const getScoresFromTempTable = async (
  input: DatasetRunsTableInput,
  tableName: string,
  clickhouseSession: string,
) => {
  const query = `
      SELECT 
        s.*,
        tmp.run_id
      FROM ${tableName} tmp JOIN scores s 
        ON tmp.project_id = s.project_id 
        AND tmp.observation_id = s.observation_id 
        AND tmp.trace_id = s.trace_id
      WHERE s.project_id = {projectId: String}
      AND tmp.project_id = {projectId: String}
      AND tmp.dataset_id = {datasetId: String}
      ORDER BY s.event_ts DESC
      LIMIT 1 BY s.id, s.project_id
  `;

  const rows = await queryClickhouse<
    FetchScoresReturnType & { run_id: string }
  >({
    query: query,
    params: {
      projectId: input.projectId,
      datasetId: input.datasetId,
    },
    clickhouseConfigs: { session_id: clickhouseSession },
  });

  return rows.map((row) => ({ ...convertToScore(row), run_id: row.run_id }));
};

const getObservationLatencyAndCostForDataset = async (
  input: DatasetRunsTableInput,
  tableName: string,
  clickhouseSession: string,
) => {
  const query = `
      WITH agg AS (
      SELECT
        run_id,
        dateDiff('milliseconds', start_time, end_time) AS latency_ms,
        total_cost AS cost
      FROM observations o  JOIN ${tableName} tmp
        ON tmp.project_id = o.project_id 
        AND tmp.observation_id = o.id 
        AND tmp.trace_id = o.trace_id
      WHERE o.project_id = {projectId: String}
      AND tmp.project_id = {projectId: String}
      AND tmp.dataset_id = {datasetId: String}
      AND tmp.observation_id IS NOT NULL
      ORDER BY o.event_ts DESC
      LIMIT 1 BY o.id, o.project_id
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
    clickhouseConfigs: { session_id: clickhouseSession },
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
  clickhouseSession: string,
) => {
  const query = `
      WITH agg AS (
      SELECT
        o.trace_id,
        run_id,
        dateDiff('milliseconds', min(start_time), max(end_time)) AS latency_ms,
        sum(total_cost) AS cost
      FROM observations o  JOIN ${tableName} tmp
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
    clickhouseConfigs: { session_id: clickhouseSession },
  });

  return rows.map((row) => ({
    runId: row.run_id,
    latency: Number(row.avg_latency_ms) / 1000,
    cost: Number(row.avg_total_cost),
  }));
};
