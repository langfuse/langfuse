import { prisma } from "../../db";
import { type DatasetItemMediaField } from "../../domain";
import { env } from "../../env";
import { InvalidRequestError } from "../../errors";
import { findMediaReferences } from "../../utils/mediaReferences";
import { logger } from "../logger";
import { releaseDatasetMedia } from "../media-deletion";
import { getS3MediaStorageClient } from "../s3";

type DatasetItemMediaValues = {
  input?: unknown;
  expectedOutput?: unknown;
  metadata?: unknown;
};

type DatasetItemMediaSource = DatasetItemMediaValues & {
  datasetId: string;
  datasetItemId: string;
  datasetItemValidFrom: Date;
};

function collectMediaReferences(item: DatasetItemMediaValues) {
  const fieldValues: { field: DatasetItemMediaField; value: unknown }[] = [
    { field: "input", value: item.input },
    { field: "expected_output", value: item.expectedOutput },
    { field: "metadata", value: item.metadata },
  ];

  return fieldValues.flatMap(({ field, value }) =>
    findMediaReferences(value).map((reference) => ({
      field,
      jsonPath: reference.jsonPath,
      referenceString: reference.referenceString,
      mediaId: reference.id,
    })),
  );
}

/**
 * Throws if items reference media that does not exist in the project.
 * Call before persisting items so failed writes leave no partial state.
 */
export async function validateDatasetItemMediaReferences(props: {
  projectId: string;
  items: DatasetItemMediaValues[];
}) {
  const referencedMediaIds = [
    ...new Set(
      props.items.flatMap((item) =>
        collectMediaReferences(item).map((reference) => reference.mediaId),
      ),
    ),
  ];
  if (referencedMediaIds.length === 0) return;

  const existingMedia = await prisma.media.findMany({
    where: { projectId: props.projectId, id: { in: referencedMediaIds } },
    select: { id: true },
  });
  const existingMediaIds = new Set(existingMedia.map((media) => media.id));

  const unknownMediaIds = referencedMediaIds.filter(
    (id) => !existingMediaIds.has(id),
  );
  if (unknownMediaIds.length > 0) {
    throw new InvalidRequestError(
      `Dataset item references unknown media: ${unknownMediaIds.join(", ")}`,
    );
  }
}

/**
 * Records which media a dataset item version references in dataset_item_media
 * and marks that media as dataset-retained so it is excluded from
 * trace-retention deletion. Referenced media must exist — call
 * validateDatasetItemMediaReferences before persisting the items.
 *
 * `replaceExisting` is for in-place updates with versioning disabled
 * (STATEFUL), where the item version (id, validFrom) stays the same and
 * removed references must be unlinked. Versioned updates write a new
 * validFrom, so old versions keep their rows and the delete is a no-op.
 */
export async function syncDatasetItemMedia(props: {
  projectId: string;
  items: DatasetItemMediaSource[];
  // true for in-place (STATEFUL) updates, false when inserting a fresh version
  replaceExisting: boolean;
}) {
  const { projectId, items, replaceExisting } = props;

  const rows = items.flatMap((item) =>
    collectMediaReferences(item).map((reference) => ({
      projectId,
      datasetId: item.datasetId,
      datasetItemId: item.datasetItemId,
      datasetItemValidFrom: item.datasetItemValidFrom,
      ...reference,
    })),
  );

  // Hot path: items without media need no queries. With replaceExisting we
  // still delete so references removed by the update are unlinked.
  if (rows.length === 0 && !replaceExisting) return;

  // For in-place (STATEFUL) updates the previously referenced media must be
  // released if the update dropped it; capture it before deleting the rows.
  const priorMediaIds = replaceExisting
    ? (
        await prisma.datasetItemMedia.findMany({
          select: { mediaId: true },
          where: {
            projectId,
            OR: items.map((item) => ({
              datasetItemId: item.datasetItemId,
              datasetItemValidFrom: item.datasetItemValidFrom,
            })),
          },
          distinct: ["mediaId"],
        })
      ).map((row) => row.mediaId)
    : [];

  await prisma.$transaction(async (tx) => {
    if (replaceExisting) {
      await tx.datasetItemMedia.deleteMany({
        where: {
          projectId,
          OR: items.map((item) => ({
            datasetItemId: item.datasetItemId,
            datasetItemValidFrom: item.datasetItemValidFrom,
          })),
        },
      });
    }

    if (rows.length > 0) {
      await tx.datasetItemMedia.createMany({
        data: rows,
        skipDuplicates: true,
      });
      await tx.media.updateMany({
        where: {
          projectId,
          id: { in: [...new Set(rows.map((row) => row.mediaId))] },
          retainedByDatasetAt: null,
        },
        data: { retainedByDatasetAt: new Date() },
      });
    }
  });

  // Best-effort release of media the update dropped: the item write is already
  // committed, so a cleanup failure is logged and retried on the next change.
  const bucket = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;
  if (priorMediaIds.length > 0 && bucket) {
    try {
      await releaseDatasetMedia({
        projectId,
        mediaIds: priorMediaIds,
        storageClient: getS3MediaStorageClient(bucket),
      });
    } catch (error) {
      logger.error(
        `Failed to release orphaned dataset media in project ${projectId}`,
        error,
      );
    }
  }
}
