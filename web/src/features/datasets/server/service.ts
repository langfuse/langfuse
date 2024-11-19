import { paginationZod, Prisma } from "@langfuse/shared";
import { prisma } from "@langfuse/shared/src/db";
import { v4 } from "uuid";
import { z } from "zod";

export const datasetRunsTableSchema = z.object({
  projectId: z.string(),
  datasetId: z.string(),
  queryClickhouse: z.boolean().optional().default(false),
  ...paginationZod,
});

export type DatasetRunsTableInput = z.infer<typeof datasetRunsTableSchema>;

// we might have many traces / observations in Postgres which belong to data in clickhouse.
// We need to create a temp table in CH, dump the data in there, and then join in CH.
export const createDatasetRunsTable = (input: DatasetRunsTableInput) => {
  const tableName = `dataset_runs_${input.projectId}_${input.datasetId}_${v4()}`;
  const runs = getDatasetRunsFromPostgres(input);
};

export const createTempTableInClickhouse = async (
  input: DatasetRunsTableInput,
) => {
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
  const result = await commandClickhouse({ query, params: { tableName } });
};

export const getDatasetRunsFromPostgres = async (
  input: DatasetRunsTableInput,
) => {
  return await prisma.$queryRaw<
    {
      run_id: string;
      run_name: string;
      run_description: string;
      run_metadata: Prisma.JsonValue;
      run_created_at: Date;
      run_updated_at: Date;
      run_items: {
        trace_id: string;
        observation_id: string;
        ri_id: string;
      }[];
    }[]
  >(
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
function commandClickhouse() {
  throw new Error("Function not implemented.");
}
