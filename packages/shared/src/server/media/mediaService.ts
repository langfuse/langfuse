import { createHash, randomUUID } from "crypto";
import { Readable } from "stream";

import { Prisma, prisma } from "../../db";
import {
  getFileExtensionFromContentType,
  type MediaContentType,
  type MediaField,
} from "../../domain/media";
import { InternalServerError } from "../../errors";
import { recordHistogram, recordIncrement } from "../instrumentation";
import { getS3MediaStorageClient } from "../s3";
import { summarizeS3Error } from "../services/s3SigningDiagnostics";

/** Derives the stable, URL-safe public media ID from a full SHA-256 hash. */
export function getMediaId(sha256Hash: string): string {
  const urlSafeHash = sha256Hash.replaceAll("+", "-").replaceAll("/", "_");

  return urlSafeHash.slice(0, 22);
}

/** Builds the project-scoped object key used in the configured media bucket. */
export function getMediaBucketPath(params: {
  projectId: string;
  mediaId: string;
  contentType: MediaContentType;
  prefix: string;
}): string {
  const { projectId, mediaId, contentType, prefix } = params;
  const fileExtension = getFileExtensionFromContentType(contentType);

  return `${prefix}${projectId}/${mediaId}.${fileExtension}`;
}

/**
 * Creates or refreshes a media row while guarding against truncated media-ID
 * collisions. This mutates database state but does not upload or link media.
 */
export async function upsertMediaRecord(params: {
  mediaId: string;
  projectId: string;
  sha256Hash: string;
  bucketPath: string;
  uploadBucket: string;
  contentType: MediaContentType;
  contentLength: number;
}): Promise<void> {
  const {
    mediaId,
    projectId,
    sha256Hash,
    bucketPath,
    uploadBucket,
    contentType,
    contentLength,
  } = params;

  // Media has unique constraints for both the public ID and full hash. Absorb
  // either concurrent insert conflict, then prove both values match before
  // reusing the row so a truncated-ID collision can never cross-link content.
  await prisma.$executeRaw`
    INSERT INTO "media" (
      "id",
      "project_id",
      "sha_256_hash",
      "bucket_path",
      "bucket_name",
      "content_type",
      "content_length"
    )
    VALUES (
      ${mediaId},
      ${projectId},
      ${sha256Hash},
      ${bucketPath},
      ${uploadBucket},
      ${contentType},
      ${contentLength}
    )
    ON CONFLICT DO NOTHING
  `;

  const result = await prisma.media.updateMany({
    where: {
      projectId,
      id: mediaId,
      sha256Hash,
    },
    data: {
      bucketName: uploadBucket,
      bucketPath,
      contentType,
      contentLength: BigInt(contentLength),
    },
  });

  if (result.count === 0) {
    throw new InternalServerError(
      `Media ID collision detected for media ID ${mediaId} in project ${projectId}. The existing media row has a different id or sha_256_hash.`,
    );
  }
}

/**
 * Idempotently links an uploaded media row to either an observation or trace.
 * An `observationId` selects `observation_media`; otherwise `trace_media` is
 * used. This mutates database state only.
 */
export async function linkMediaToTraceOrObservation(params: {
  projectId: string;
  traceId: string;
  observationId?: string | null;
  mediaId: string;
  field: string;
}): Promise<void> {
  const { projectId, traceId, observationId, mediaId, field } = params;

  if (observationId) {
    await prisma.$queryRaw`
      INSERT INTO "observation_media" (
        "id",
        "project_id",
        "trace_id",
        "observation_id",
        "media_id",
        "field"
      )
      VALUES (
        ${randomUUID()},
        ${projectId},
        ${traceId},
        ${observationId},
        ${mediaId},
        ${field}
      )
      ON CONFLICT DO NOTHING
    `;
    return;
  }

  await prisma.$queryRaw`
    INSERT INTO "trace_media" (
      "id",
      "project_id",
      "trace_id",
      "media_id",
      "field"
    )
    VALUES (
      ${randomUUID()},
      ${projectId},
      ${traceId},
      ${mediaId},
      ${field}
    )
    ON CONFLICT DO NOTHING
  `;
}

export type UploadMediaForTraceResult = {
  /** Stable ID referenced from normalized input, output, or metadata. */
  mediaId: string;
  /** Whether this call uploaded new bytes or reused an uploaded media row. */
  outcome: "uploaded" | "reused";
};

/**
 * Persists binary media and links it to a trace or observation.
 *
 * Content is deduplicated per project by its full SHA-256 hash. For new media,
 * the link is created only after S3 upload and the media row's upload status
 * are confirmed, preventing failed uploads from leaving dangling links. This
 * function mutates PostgreSQL and media storage; it does not mutate its input
 * parameters or the caller's normalized OTEL payload.
 */
export async function uploadMediaForTrace(params: {
  projectId: string;
  traceId: string;
  observationId?: string;
  field: MediaField;
  contentType: MediaContentType;
  contentBytes: Buffer;
  mediaBucket: string;
  mediaPrefix: string;
}): Promise<UploadMediaForTraceResult> {
  const {
    projectId,
    traceId,
    observationId,
    field,
    contentType,
    contentBytes,
    mediaBucket,
    mediaPrefix,
  } = params;
  const sha256Hash = createHash("sha256").update(contentBytes).digest("base64");
  const mediaId = getMediaId(sha256Hash);
  const existingMedia = await prisma.media.findUnique({
    where: {
      projectId_sha256Hash: {
        projectId,
        sha256Hash,
      },
    },
  });

  if (
    existingMedia &&
    (existingMedia.uploadHttpStatus === 200 ||
      existingMedia.uploadHttpStatus === 201) &&
    existingMedia.contentType === contentType
  ) {
    await linkMediaToTraceOrObservation({
      projectId,
      traceId,
      observationId,
      mediaId: existingMedia.id,
      field,
    });
    return { mediaId: existingMedia.id, outcome: "reused" };
  }

  const bucketPath = getMediaBucketPath({
    projectId,
    mediaId,
    contentType,
    prefix: mediaPrefix,
  });

  await upsertMediaRecord({
    mediaId,
    projectId,
    sha256Hash,
    bucketPath,
    uploadBucket: mediaBucket,
    contentType,
    contentLength: contentBytes.length,
  });

  const uploadStartedAt = Date.now();
  try {
    await getS3MediaStorageClient(mediaBucket).uploadFile({
      fileName: bucketPath,
      fileType: contentType,
      data: Readable.from([contentBytes]),
    });
  } catch (error) {
    const statusCode = summarizeS3Error(error).httpStatusCode ?? 500;
    recordIncrement("langfuse.media.upload_http_status", 1, {
      status_code: statusCode,
    });
    recordHistogram(
      "langfuse.media.upload_time_ms",
      Date.now() - uploadStartedAt,
      { status_code: statusCode },
    );
    throw error;
  }
  const uploadTimeMs = Date.now() - uploadStartedAt;

  try {
    await prisma.media.update({
      where: {
        projectId_id: {
          projectId,
          id: mediaId,
        },
      },
      data: {
        uploadedAt: new Date(),
        uploadHttpStatus: 200,
        uploadHttpError: null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new InternalServerError(
        `Media asset ${mediaId} not found after server-side upload`,
      );
    }
    throw error;
  }

  await linkMediaToTraceOrObservation({
    projectId,
    traceId,
    observationId,
    mediaId,
    field,
  });

  recordIncrement("langfuse.media.upload_http_status", 1, {
    status_code: 200,
  });
  recordHistogram("langfuse.media.upload_time_ms", uploadTimeMs, {
    status_code: 200,
  });

  return { mediaId, outcome: "uploaded" };
}
