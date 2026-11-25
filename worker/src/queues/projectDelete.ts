import { Job, Processor } from "bullmq";
import {
  deleteEventsByProjectId,
  deleteMediaLinkRowsByProjectId,
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
import { deleteTopicDataByProjectId } from "@langfuse/shared/topics/server";
import { prisma } from "@langfuse/shared/src/db";
import { Prisma } from "@prisma/client";
import { env, v4WritesToEventsTable } from "../env";

async function deleteProjectMediaInBatches(params: {
  projectId: string;
  bucket: string;
}): Promise<void> {
  const { projectId } = params;
  const storageClient = getS3MediaStorageClient(params.bucket);
  // Each batch commits, so a retried job resumes. The cursor moves past
  // rows that deleteMediaFiles skips, so the loop always terminates.
  let afterId: string | undefined;
  while (true) {
    const mediaFiles = await findAllMediaByProjectId({
      projectId,
      limit: env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_BATCH_SIZE,
      afterId,
    });
    if (mediaFiles.length === 0) return;
    await deleteMediaFiles({ projectId, mediaFiles, storageClient });
    afterId = mediaFiles[mediaFiles.length - 1].id;
  }
}

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

  await deleteMediaLinkRowsByProjectId({
    projectId,
    batchSize: env.LANGFUSE_BATCH_PROJECT_MEDIA_CLEANER_BATCH_SIZE,
  });

  // Delete media data from S3 and PG for project
  if (env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    logger.info(`Deleting media for ${projectId} in org ${orgId}`);
    await deleteProjectMediaInBatches({
      projectId,
      bucket: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
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
    deleteTopicDataByProjectId(projectId),
    v4WritesToEventsTable(env)
      ? deleteEventsByProjectId(projectId)
      : Promise.resolve(),
  ]);

  // Trigger async delete of dataset run items
  await deleteDatasetRunItemsByProjectId(projectId);

  logger.info(`Deleting PG data for project ${projectId} in org ${orgId}`);

  // Finally, delete the project itself which should delete all related
  // resources due to the referential actions defined via Prisma.
  //
  // WARNING: unbounded. The cascade removes all rows with a cascading relation
  // to the project in a single statement and transaction. For large projects
  // this holds one long transaction on the Postgres writer and can pin its
  // CPU. Delete large child tables in bounded batches before this call rather
  // than relying on the cascade.
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
