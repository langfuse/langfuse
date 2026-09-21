import { Prisma } from "@prisma/client";

import { prisma } from "../../db";
import { type DatasetItemMediaField } from "../../domain";
import { InvalidRequestError, LangfuseNotFoundError } from "../../errors";
import { findMediaReferences } from "../../utils/mediaReferences";
import {
  addTagsToCurrentSpan,
  recordHistogram,
  recordIncrement,
} from "../instrumentation";

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
    { field: "expectedOutput", value: item.expectedOutput },
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
 * Returns references (tagged with their item index) whose media is missing or
 * not finished uploading, so bulk callers can fail a single item rather than
 * the whole batch. Requires uploadHttpStatus 200/201, matching the resolvers.
 */
export async function findUnresolvableMediaReferences(props: {
  projectId: string;
  items: DatasetItemMediaValues[];
}) {
  const references = props.items.flatMap((item, itemIndex) =>
    collectMediaReferences(item).map((reference) => ({
      itemIndex,
      field: reference.field,
      jsonPath: reference.jsonPath,
      mediaId: reference.mediaId,
    })),
  );
  if (references.length === 0) return [];

  const mediaIds = [
    ...new Set(references.map((reference) => reference.mediaId)),
  ];
  const existingMedia = await prisma.media.findMany({
    where: {
      projectId: props.projectId,
      id: { in: mediaIds },
      uploadHttpStatus: { in: [200, 201] },
    },
    select: { id: true },
  });
  const existingMediaIds = new Set(existingMedia.map((media) => media.id));

  return references.filter(
    (reference) => !existingMediaIds.has(reference.mediaId),
  );
}

/**
 * Throws if any item references media that does not exist in the project or has
 * not finished uploading. Call before persisting items on the single-item /
 * upsert paths so failed writes leave no partial state. Bulk callers that
 * support partial success should use findUnresolvableMediaReferences and report
 * per item instead.
 */
export async function validateDatasetItemMediaReferences(props: {
  projectId: string;
  items: DatasetItemMediaValues[];
}) {
  const unresolvable = await findUnresolvableMediaReferences(props);
  if (unresolvable.length > 0) {
    const unknownMediaIds = [
      ...new Set(unresolvable.map((reference) => reference.mediaId)),
    ];
    throw new InvalidRequestError(
      `Dataset item references unknown media: ${unknownMediaIds.join(", ")}`,
    );
  }
}

/**
 * Records a dataset media upload result, refusing to overwrite an
 * already-successful upload — datasets:CUD reaches any project media id via
 * SHA-256 dedupe, so a completed upload must not be flippable to a failure.
 */
export async function markDatasetMediaUploadComplete(props: {
  projectId: string;
  mediaId: string;
  uploadedAt: Date;
  uploadHttpStatus: number;
  uploadHttpError?: string | null;
  uploadTimeMs?: number | null;
}) {
  const media = await prisma.media.findUnique({
    where: { projectId_id: { projectId: props.projectId, id: props.mediaId } },
    select: { uploadHttpStatus: true },
  });
  if (!media) {
    throw new LangfuseNotFoundError(
      `Media asset ${props.mediaId} not found in project ${props.projectId}`,
    );
  }
  const hasCompletedUpload =
    media.uploadHttpStatus === 200 || media.uploadHttpStatus === 201;
  const isCompletingUpload =
    props.uploadHttpStatus === 200 || props.uploadHttpStatus === 201;
  if (hasCompletedUpload && !isCompletingUpload) {
    throw new InvalidRequestError(
      `Media asset ${props.mediaId} already has a completed upload`,
    );
  }

  await prisma.media.update({
    where: { projectId_id: { projectId: props.projectId, id: props.mediaId } },
    data: {
      uploadedAt: props.uploadedAt,
      uploadHttpStatus: props.uploadHttpStatus,
      uploadHttpError:
        props.uploadHttpStatus === 200 ? null : props.uploadHttpError,
    },
  });

  recordIncrement("langfuse.media.upload_http_status", 1, {
    status_code: props.uploadHttpStatus,
  });
  if (props.uploadTimeMs) {
    recordHistogram("langfuse.media.upload_time_ms", props.uploadTimeMs, {
      status_code: props.uploadHttpStatus,
    });
  }
}

/**
 * Declares a pending media association at upload (a dataset_item_media row with
 * null validFrom/jsonPath/referenceString), claimed when the item is written.
 * Verifies the dataset belongs to the project; the item may not exist yet.
 */
export async function declarePendingDatasetItemMedia(props: {
  projectId: string;
  datasetId: string;
  datasetItemId: string;
  field: DatasetItemMediaField;
  mediaId: string;
}) {
  const dataset = await prisma.dataset.findFirst({
    where: { id: props.datasetId, projectId: props.projectId },
    select: { id: true },
  });
  if (!dataset) {
    throw new LangfuseNotFoundError(
      `Dataset ${props.datasetId} not found in project ${props.projectId}`,
    );
  }

  // createMany for skipDuplicates: redeclaring the same (item, field, media)
  // is a no-op against the pending partial unique index (create would throw,
  // and upsert can't target a partial index).
  await prisma.datasetItemMedia.createMany({
    data: [
      {
        projectId: props.projectId,
        datasetId: props.datasetId,
        datasetItemId: props.datasetItemId,
        field: props.field,
        mediaId: props.mediaId,
        datasetItemValidFrom: null,
        jsonPath: null,
        referenceString: null,
      },
    ],
    skipDuplicates: true,
  });
}

/**
 * Writes the dataset_item_media rows for an item version (enroll in the item
 * write transaction). Associations are derived from the item JSON; a matching
 * pending row declared at upload is consumed. `replaceExisting` unlinks removed
 * references for in-place (STATEFUL) updates where the version is unchanged.
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
  addTagsToCurrentSpan({
    "langfuse.dataset_item_media.link.item_count": items.length,
  });
  if (items.length === 0) return;

  const rowsToInsert: Prisma.DatasetItemMediaCreateManyInput[] = items.flatMap(
    (item) =>
      collectMediaReferences(item).map((reference) => ({
        projectId,
        datasetId: item.datasetId,
        datasetItemId: item.datasetItemId,
        datasetItemValidFrom: item.datasetItemValidFrom,
        field: reference.field,
        jsonPath: reference.jsonPath,
        referenceString: reference.referenceString,
        mediaId: reference.mediaId,
      })),
  );
  addTagsToCurrentSpan({
    "langfuse.dataset_item_media.link.reference_count": rowsToInsert.length,
  });

  // Hot path: items without media still need the replaceExisting delete.
  if (rowsToInsert.length === 0 && !replaceExisting) return;

  if (replaceExisting) {
    await deleteDatasetItemMediaLinks(tx, { projectId, itemVersions: items });
  }

  if (rowsToInsert.length > 0) {
    const createResult = await tx.datasetItemMedia.createMany({
      data: rowsToInsert,
      skipDuplicates: true,
    });
    addTagsToCurrentSpan({
      "langfuse.dataset_item_media.link.created_count": createResult.count,
    });
    // Consume the claimed pending rows; unclaimed ones are swept by retention.
    const pendingDeleteResult = await tx.datasetItemMedia.deleteMany({
      where: {
        projectId,
        datasetItemValidFrom: null,
        OR: rowsToInsert.map((row) => ({
          datasetItemId: row.datasetItemId,
          mediaId: row.mediaId,
        })),
      },
    });
    addTagsToCurrentSpan({
      "langfuse.dataset_item_media.link.pending_deleted_count":
        pendingDeleteResult.count,
    });
  }
}

export async function deleteDatasetItemMediaLinks(
  tx: Prisma.TransactionClient,
  props: {
    projectId: string;
    itemVersions: Pick<
      DatasetItemMediaSource,
      "datasetItemId" | "datasetItemValidFrom"
    >[];
  },
) {
  const { projectId, itemVersions } = props;
  addTagsToCurrentSpan({
    "langfuse.dataset_item_media.delete.item_version_count":
      itemVersions.length,
  });
  if (itemVersions.length === 0) return;

  const versionFilters = itemVersions.map((itemVersion) => ({
    datasetItemId: itemVersion.datasetItemId,
    datasetItemValidFrom: itemVersion.datasetItemValidFrom,
  }));

  const deleteResult = await tx.datasetItemMedia.deleteMany({
    where: {
      projectId,
      OR: versionFilters,
    },
  });
  addTagsToCurrentSpan({
    "langfuse.dataset_item_media.delete.deleted_count": deleteResult.count,
  });
}
