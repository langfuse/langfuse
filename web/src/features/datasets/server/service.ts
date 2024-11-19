import { paginationZod, Prisma } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";
import { z } from "zod";
import {
  clickhouseClient,
  commandClickhouse,
  logger,
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
}

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
  const tableName = `dataset_runs_${input.projectId}_${input.datasetId}_${v4()}`;
  try {
    const runs = getDatasetRunsFromPostgres(input);
    await createTempTableInClickhouse(tableName);
  } catch (e) {
    logger.error("Failed to fetch dataset runs from clickhouse", e);
    await deleteTempTableInClickhouse(tableName);
  }
};

export const insertPostgresDatasetRunsIntoClickhouse = async (
  runs: PostgresDatasetRun[],
  tableName: string,
) => {
  await clickhouseClient.insert({
    table: tableName,

    format: "JSONEachRow",
  });
};

export const createTempTableInClickhouse = async (tableName: string) => {
  const query = `
      CREATE TEMPORARY TABLE IF NOT EXISTS {tableName: String}
      (
          project_id String,    
          run_id String,  
          run_item_is String,
          dataset_id String,      
          trace_id String,
          observation_id Nullable(String),
      )  ENGINE = Memory

  `;
  await commandClickhouse({ query, params: { tableName } });
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
