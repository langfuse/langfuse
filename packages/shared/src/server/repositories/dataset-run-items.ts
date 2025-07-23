import { env } from "../../env";
import { commandClickhouse } from "./clickhouse";

export const deleteDatasetRunItemsByProjectId = async (projectId: string) => {
  const query = `
      DELETE FROM dataset_run_items
      WHERE project_id = {projectId: String};
    `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      kind: "delete",
      projectId,
    },
  });
};

export const deleteDatasetRunItemsByDatasetRunId = async (
  projectId: string,
  datasetRunId: string,
  datasetId: string,
) => {
  const query = `
    DELETE FROM dataset_run_items
    WHERE project_id = {projectId: String}
    AND dataset_run_id = {datasetRunId: String}
    AND dataset_id = {datasetId: String}
  `;

  await commandClickhouse({
    query,
    params: {
      projectId,
      datasetRunId,
      datasetId,
    },
    clickhouseConfigs: {
      request_timeout: 120_000, // 2 minutes
    },
    tags: {
      feature: "datasets",
      action: "delete",
    },
  });
};
