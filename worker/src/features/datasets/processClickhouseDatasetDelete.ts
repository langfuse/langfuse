import {
  deleteDatasetRunItemsByDatasetRunIds,
  deleteDatasetRunItemsByDatasetId,
  logger,
  traceException,
  DatasetQueueEventType,
  QueueName,
} from "@langfuse/shared/src/server";

export const processClickhouseDatasetDelete = async (
  jobPayload: DatasetQueueEventType,
) => {
  const { deletionType, projectId, datasetId } = jobPayload;

  logger.info(
    `Deleting dataset run items for dataset ${datasetId} ${
      deletionType === "dataset-runs" ? `runs ${jobPayload.datasetRunIds}` : ""
    } in project ${projectId} from ClickHouse`,
  );

  try {
    const clickHouseQueryTags = {
      surface: "worker" as const,
      route: QueueName.DatasetDelete,
    };

    switch (deletionType) {
      case "dataset":
        await deleteDatasetRunItemsByDatasetId({
          projectId,
          datasetId,
          clickHouseQueryTags,
        });
        break;

      case "dataset-runs":
        await deleteDatasetRunItemsByDatasetRunIds({
          projectId,
          datasetRunIds: jobPayload.datasetRunIds,
          datasetId,
          clickHouseQueryTags,
        });
        break;

      default:
        throw new Error(`Invalid deletion type: ${deletionType}`);
    }
  } catch (e) {
    logger.error(
      `Error deleting dataset run items for dataset ${datasetId} ${
        deletionType === "dataset-runs"
          ? `runs ${jobPayload.datasetRunIds}`
          : ""
      } in project ${projectId} from ClickHouse`,
      e,
    );
    traceException(e);
    throw e;
  }
};
