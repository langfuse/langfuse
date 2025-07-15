import { commandClickhouse } from "./clickhouse";

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
