import { env } from "../../env";
import { commandClickhouse } from "./clickhouse";

export const deleteDatasetRunItemsByProjectId = async ({
  projectId,
}: {
  projectId: string;
}) => {
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

export const deleteDatasetRunItemsByDatasetId = async ({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}) => {
  const query = `
  DELETE FROM dataset_run_items
  WHERE project_id = {projectId: String}
  AND dataset_id = {datasetId: String}
`;

  await commandClickhouse({
    query,
    params: {
      projectId,
      datasetId,
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

export const deleteDatasetRunItemsByDatasetRunIds = async ({
  projectId,
  datasetRunIds,
  datasetId,
}: {
  projectId: string;
  datasetRunIds: string[];
  datasetId: string;
}) => {
  const query = `
    DELETE FROM dataset_run_items
    WHERE project_id = {projectId: String}
    AND dataset_id = {datasetId: String}
    AND dataset_run_id IN ({datasetRunIds: Array(String)})
  `;

  await commandClickhouse({
    query,
    params: {
      projectId,
      datasetRunIds,
      datasetId,
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
