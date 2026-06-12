import { prisma } from "../../db";
import { type DatasetItemMediaField } from "../../domain";
import { InvalidRequestError } from "../../errors";
import { findMediaReferences } from "../../utils/mediaReferences";

type DatasetItemMediaValues = {
  input?: unknown;
  expectedOutput?: unknown;
  metadata?: unknown;
};

type DatasetItemMediaSource = DatasetItemMediaValues & {
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
  replaceExisting?: boolean;
}) {
  const { projectId, items, replaceExisting } = props;

  const rows = items.flatMap((item) =>
    collectMediaReferences(item).map((reference) => ({
      projectId,
      datasetItemId: item.datasetItemId,
      datasetItemValidFrom: item.datasetItemValidFrom,
      ...reference,
    })),
  );

  // Hot path: items without media need no queries. With replaceExisting we
  // still delete so references removed by the update are unlinked.
  if (rows.length === 0 && !replaceExisting) return;

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
}
