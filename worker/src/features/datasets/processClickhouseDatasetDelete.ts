import {
  deleteDatasetMediaByDatasetId,
  deleteDatasetRunItemsByDatasetRunIds,
  deleteDatasetRunItemsByDatasetId,
  getS3MediaStorageClient,
  logger,
  traceException,
  DatasetQueueEventType,
} from "@langfuse/shared/src/server";
import { env } from "../../env";

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
    switch (deletionType) {
      case "dataset":
        // Always drop the dataset_item_media link rows (no FK cascades them);
        // only the S3 release needs a configured bucket.
        await deleteDatasetMediaByDatasetId({
          projectId,
          datasetId,
          storageClient: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET
            ? getS3MediaStorageClient(env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET)
            : undefined,
        });
        await deleteDatasetRunItemsByDatasetId({ projectId, datasetId });
        break;

      case "dataset-runs":
        await deleteDatasetRunItemsByDatasetRunIds({
          projectId,
          datasetRunIds: jobPayload.datasetRunIds,
          datasetId,
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
