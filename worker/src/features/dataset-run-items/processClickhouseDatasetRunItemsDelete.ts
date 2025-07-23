import {
  deleteDatasetRunItemsByDatasetRunId,
  logger,
  traceException,
} from "@langfuse/shared/src/server";

export const processClickhouseDatasetRunItemsDelete = async (
  projectId: string,
  datasetRunId: string,
  datasetId: string,
) => {
  logger.info(
    `Deleting dataset run items for dataset run ${datasetRunId} in project ${projectId} from ClickHouse`,
  );

  try {
    await deleteDatasetRunItemsByDatasetRunId({
      projectId,
      datasetRunId,
      datasetId,
    });
  } catch (e) {
    logger.error(
      `Error deleting dataset run items for dataset run ${datasetRunId} in project ${projectId} from ClickHouse`,
      e,
    );
    traceException(e);
    throw e;
  }
};
