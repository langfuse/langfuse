import { Job, Processor } from "bullmq";
import {
  deleteEventsByProjectId,
  deleteMediaFiles,
  deleteObservationsByProjectId,
  deleteScoresByProjectId,
  deleteTracesByProjectId,
  deleteDatasetRunItemsByProjectId,
  findAllMediaByProjectId,
  getCurrentSpan,
  getS3MediaStorageClient,
  logger,
  QueueName,
  removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject,
  TQueueJobTypes,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import { Prisma } from "@prisma/client";
import { env } from "../env";

export const projectDeleteProcessor: Processor = async (
  job: Job<TQueueJobTypes[QueueName.ProjectDelete]>,
): Promise<void> => {
  const { orgId, projectId } = job.data.payload;

  const span = getCurrentSpan();
  if (span) {
    span.setAttribute("messaging.bullmq.job.input.id", job.data.id);
    span.setAttribute(
      "messaging.bullmq.job.input.projectId",
      job.data.payload.projectId,
    );
    span.setAttribute(
      "messaging.bullmq.job.input.orgId",
      job.data.payload.orgId,
    );
  }

  logger.info(`Deleting ${projectId} in org ${orgId}`);

  // Delete media data from S3 and PG for project
  if (env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    logger.info(`Deleting media for ${projectId} in org ${orgId}`);
    const mediaFilesToDelete = await findAllMediaByProjectId({ projectId });
    await deleteMediaFiles({
      projectId,
      mediaFiles: mediaFilesToDelete,
      storageClient: getS3MediaStorageClient(
        env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
      ),
    });
  }

  logger.info(
    `Deleting ClickHouse and S3 data for ${projectId} in org ${orgId}`,
  );

  // Delete project data from ClickHouse first
  await Promise.all([
    env.LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG === "true"
      ? removeIngestionEventsFromS3AndDeleteClickhouseRefsForProject(
          projectId,
          undefined,
        )
      : Promise.resolve(),
    deleteTracesByProjectId(projectId),
    deleteObservationsByProjectId(projectId),
    deleteScoresByProjectId(projectId),
    env.LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE === "true"
      ? deleteEventsByProjectId(projectId)
      : Promise.resolve(),
  ]);

  // Trigger async delete of dataset run items
  await deleteDatasetRunItemsByProjectId(projectId);

  logger.info(`Deleting PG data for project ${projectId} in org ${orgId}`);

  // Finally, delete the project itself which should delete all related
  // resources due to the referential actions defined via Prisma
  try {
    const existingProject = await prisma.project.findUnique({
      where: {
        id: projectId,
        orgId,
      },
    });
    if (!existingProject) {
      logger.info(
        `Tried to delete project ${projectId} from PG, but it does not exist anymore.`,
      );
      return;
    }
    await prisma.project.delete({
      where: {
        id: projectId,
        orgId,
      },
    });
  } catch (e) {
    logger.error(`Error deleting project ${projectId} in org ${orgId}: ${e}`, {
      stack: e instanceof Error ? e.stack : undefined,
    });
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2025" || e.code === "P2016") {
        logger.warn(
          `Tried to delete project ${projectId} in org ${orgId}, but it does not exist`,
        );
        return;
      }
    }
    throw e;
  }

  logger.info(`Deleted ${projectId} in org ${orgId}`);
};
