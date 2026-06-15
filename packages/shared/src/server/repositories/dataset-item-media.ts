import { Prisma } from "@prisma/client";

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
    where: {
      projectId: props.projectId,
      id: { in: referencedMediaIds },
      uploadHttpStatus: { in: [200, 201] },
    },
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
 * trace-retention deletion, using the given transaction client. Enroll this in
 * the same transaction as the item write so an item is never committed without
 * its media linked and retention-protected (a gap that, for bulk-imported
 * items never re-edited, would otherwise be permanent). Referenced media must
 * exist — call validateDatasetItemMediaReferences before persisting the items.
 *
 * Returns the media ids the update dropped; the caller must release them with
 * releaseDroppedDatasetMedia *after* the transaction commits, since releasing
 * touches S3 and must not run inside the write transaction.
 *
 * `replaceExisting` is for in-place updates with versioning disabled
 * (STATEFUL), where the item version (id, validFrom) stays the same and
 * removed references must be unlinked. Versioned updates write a new
 * validFrom, so old versions keep their rows and the delete is a no-op.
 */
export async function linkDatasetItemMedia(
  tx: Prisma.TransactionClient,
  props: {
    projectId: string;
    items: DatasetItemMediaSource[];
    // true for in-place (STATEFUL) updates, false when inserting a fresh version
    replaceExisting: boolean;
  },
) {
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
  if (rows.length === 0 && !replaceExisting)
    return { droppedMediaIds: [] as string[] };

  // For in-place (STATEFUL) updates the previously referenced media must be
  // released if the update dropped it; capture it before deleting the rows.
  const priorMediaIds = replaceExisting
    ? (
        await tx.datasetItemMedia.findMany({
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

  return { droppedMediaIds: priorMediaIds };
}

/**
 * Best-effort release of media an item write dropped (see releaseDatasetMedia).
 * Call after the write transaction commits — releaseDatasetMedia touches S3, so
 * it must not run inside the write transaction. A failure is logged and
 * self-heals on the item's next edit (which re-runs the sync).
 */
export async function releaseDroppedDatasetMedia(
  projectId: string,
  droppedMediaIds: string[],
): Promise<void> {
  const bucket = env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET;
  if (droppedMediaIds.length === 0 || !bucket) return;

  try {
    await releaseDatasetMedia({
      projectId,
      mediaIds: droppedMediaIds,
      storageClient: getS3MediaStorageClient(bucket),
    });
  } catch (error) {
    logger.error(
      `Failed to release orphaned dataset media in project ${projectId}`,
      error,
    );
  }
}

/**
 * Convenience wrapper for callers that link media after their item write has
 * already committed (interactive single-item upsert/delete). Runs the link in
 * its own transaction, then releases dropped media. Prefer linkDatasetItemMedia
 * directly inside the item-write transaction where the write strategy allows
 * it, so the item and its media commit atomically.
 */
export async function syncDatasetItemMedia(props: {
  projectId: string;
  items: DatasetItemMediaSource[];
  replaceExisting: boolean;
}) {
  const { droppedMediaIds } = await prisma.$transaction((tx) =>
    linkDatasetItemMedia(tx, props),
  );

  await releaseDroppedDatasetMedia(props.projectId, droppedMediaIds);
}
