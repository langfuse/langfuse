import { env } from "@/src/env.mjs";
import { getMediaStorageServiceClient } from "@/src/features/media/server/getMediaStorageClient";
import { type APIDatasetItemMediaReference } from "@/src/features/public-api/types/datasets";
import { prisma } from "@langfuse/shared/src/db";

type DatasetItemVersionKey = {
  id: string;
  validFrom: Date;
};

/**
 * Resolves the media references of dataset item versions to signed download
 * URLs from dataset_item_media, returning one reference list per item (same
 * order as the input). One media lookup and one signed URL is generated per
 * distinct mediaId per call. References whose media is missing or not
 * uploaded yield `media: null`.
 */
export async function resolveDatasetItemMediaReferences(props: {
  projectId: string;
  items: DatasetItemVersionKey[];
}): Promise<APIDatasetItemMediaReference[][]> {
  if (props.items.length === 0) return [];

  const referenceRows = await prisma.datasetItemMedia.findMany({
    where: {
      projectId: props.projectId,
      OR: props.items.map((item) => ({
        datasetItemId: item.id,
        datasetItemValidFrom: item.validFrom,
      })),
    },
    orderBy: [{ field: "asc" }, { jsonPath: "asc" }],
  });
  if (referenceRows.length === 0) return props.items.map(() => []);

  const mediaRecords = await prisma.media.findMany({
    where: {
      projectId: props.projectId,
      id: { in: [...new Set(referenceRows.map((row) => row.mediaId))] },
      uploadHttpStatus: { in: [200, 201] },
    },
  });

  const ttlSeconds = env.LANGFUSE_S3_MEDIA_DOWNLOAD_URL_EXPIRY_SECONDS;
  const mediaById = new Map(
    await Promise.all(
      mediaRecords.map(async (media) => {
        const url = await getMediaStorageServiceClient(
          media.bucketName,
        ).getSignedUrl(media.bucketPath, ttlSeconds, false);

        return [
          media.id,
          {
            mediaId: media.id,
            contentType: media.contentType,
            contentLength: Number(media.contentLength),
            url,
            urlExpiry: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
          },
        ] as const;
      }),
    ),
  );

  return props.items.map((item) =>
    referenceRows
      .filter(
        (row) =>
          row.datasetItemId === item.id &&
          row.datasetItemValidFrom.getTime() === item.validFrom.getTime(),
      )
      .map((row) => ({
        field: row.field as APIDatasetItemMediaReference["field"],
        referenceString: row.referenceString,
        jsonPath: row.jsonPath,
        media: mediaById.get(row.mediaId) ?? null,
      })),
  );
}
