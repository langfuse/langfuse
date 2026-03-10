import { prisma } from "../db";
import { env } from "../env";
import { getS3MediaStorageClient } from "./s3";

export async function deleteMediaByProjectId(params: {
  projectId: string;
  cutoffDate?: Date;
  limit?: number;
}): Promise<number> {
  const mediaFiles = await prisma.media.findMany({
    select: { id: true, bucketPath: true },
    where: {
      projectId: params.projectId,
      createdAt: params.cutoffDate ? { lte: params.cutoffDate } : undefined,
    },
    take: params.limit,
  });

  if (mediaFiles.length === 0) {
    return 0;
  }

  if (env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    const mediaStorageClient = getS3MediaStorageClient(
      env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
    );
    await mediaStorageClient.deleteFiles(
      mediaFiles.map((file) => file.bucketPath),
    );
  }

  await prisma.media.deleteMany({
    where: {
      id: { in: mediaFiles.map((file) => file.id) },
      projectId: params.projectId,
    },
  });

  return mediaFiles.length;
}
