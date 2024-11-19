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

type DatasetRunItemTempTableRow = {
  project_id: string;
  run_id: string;
  run_item_id: string;
  dataset_id: string;
  trace_id: string;
};

export type DatasetRunsTableInput = z.infer<typeof datasetRunsTableSchema>;

// we might have many traces / observations in Postgres which belong to data in clickhouse.
// We need to create a temp table in CH, dump the data in there, and then join in CH.
export const createDatasetRunsTable = async (input: DatasetRunsTableInput) => {
  const tableName = `dataset_runs_${clickhouseCompliantRandomCharacters()}`;
  const clickhouseSession = v4();
  try {
    const runs = await getDatasetRunsFromPostgres(input);
    console.log(runs);
    await createTempTableInClickhouse(tableName, clickhouseSession);
    await insertPostgresDatasetRunsIntoClickhouse(
      runs,
      tableName,
      input.projectId,
      input.datasetId,
      clickhouseSession,
    );
    const a = await queryClickhouse({
      query: `SELECT * FROM ${tableName}`,
      params: {},
      clickhouseConfigs: { session_id: clickhouseSession },
    });

    console.log(a);
    const scores = await getScoresFromTempTable(
      input,
      tableName,
      clickhouseSession,
    );

    console.log("scores", scores);

    return {
      scores,
    };
  } catch (e) {
    logger.error("Failed to fetch dataset runs from clickhouse", e);
    await deleteTempTableInClickhouse(tableName);
    throw e;
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

export const deleteTempTableInClickhouse = async (tableName: string) => {
  const query = `
      DROP TABLE IF EXISTS {tableName: String}
  `;
  await commandClickhouse({ query, params: { tableName } });
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
        *
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

  const rows = await queryClickhouse<FetchScoresReturnType>({
    query: query,
    params: {
      projectId: input.projectId,
      datasetId: input.datasetId,
    },
    clickhouseConfigs: { session_id: clickhouseSession },
  });

  return rows.map(convertToScore);
};

const getObservationLatencyAndCostForDataset = async (
  input: DatasetRunsTableInput,
  tableName: string,
  clickhouseSession: string,
) => {
  const query = `
      SELECT 
        *
      FROM ${tableName} tmp JOIN observations o 
        ON tmp.project_id = o.project_id 
        AND tmp.observation_id = o.id 
        AND tmp.trace_id = o.trace_id
      WHERE o.project_id = {projectId: String}
      AND tmp.project_id = {projectId: String}
      AND tmp.dataset_id = {datasetId: String}
      AND tmp.observation_id IS NOT NULL
      ORDER BY o.event_ts DESC
      LIMIT 1 BY o.id, o.project_id
  `;

  const rows = await queryClickhouse<FetchScoresReturnType>({
    query: query,
    params: {
      projectId: input.projectId,
      datasetId: input.datasetId,
    },
    clickhouseConfigs: { session_id: clickhouseSession },
  });

  return rows.map(convertToScore);
};
