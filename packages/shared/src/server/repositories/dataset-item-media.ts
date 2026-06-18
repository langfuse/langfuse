import { Prisma } from "@prisma/client";

import { prisma } from "../../db";
import { type DatasetItemMediaField } from "../../domain";
import { InvalidRequestError, LangfuseNotFoundError } from "../../errors";
import { findMediaReferences } from "../../utils/mediaReferences";
import { recordHistogram, recordIncrement } from "../instrumentation";

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
 * Records which media a dataset item version references in dataset_item_media
 * using the given transaction client. Enroll this in the same transaction as
 * the item write so an item is never committed without its media linked.
 * Referenced media must exist — call validateDatasetItemMediaReferences before
 * persisting the items.
 *
 * `replaceExisting` is for in-place updates with versioning disabled
 * (STATEFUL), where the item version (id, validFrom) stays the same and
 * removed references must be unlinked. Versioned updates write a new validFrom,
 * so old versions keep their rows and the delete is a no-op.
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
  if (rows.length === 0 && !replaceExisting) return;

  if (replaceExisting) {
    await deleteDatasetItemMediaLinks(tx, { projectId, itemVersions: items });
  }

  if (rows.length > 0) {
    await tx.datasetItemMedia.createMany({
      data: rows,
      skipDuplicates: true,
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
  if (itemVersions.length === 0) return;

  const versionFilters = itemVersions.map((itemVersion) => ({
    datasetItemId: itemVersion.datasetItemId,
    datasetItemValidFrom: itemVersion.datasetItemValidFrom,
  }));

  await tx.datasetItemMedia.deleteMany({
    where: {
      projectId,
      OR: versionFilters,
    },
  });
}
