/**
 * Media Seeding Utilities
 *
 * Seeds test traces with media attachments (images, PDFs, audio) for testing
 * the JSON Beta view's media rendering capabilities.
 *
 * Integrated into the seeder flow - runs automatically during `dx` or `db:seed:examples`.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Readable } from "stream";

import { prisma } from "../../src/db";
import { env } from "../../src/env";
import { logger, StorageServiceFactory } from "../../src/server";

// Test file paths (relative to monorepo root)
const TEST_FILES_DIR = path.join(
  __dirname,
  "../../../../web/src/__tests__/static",
);

interface MediaFile {
  name: string;
  contentType: string;
  filePath: string;
}

const MEDIA_FILES: Record<string, MediaFile> = {
  image: {
    name: "langfuse-logo.png",
    contentType: "image/png",
    filePath: path.join(TEST_FILES_DIR, "langfuse-logo.png"),
  },
  pdf: {
    name: "bitcoin.pdf",
    contentType: "application/pdf",
    filePath: path.join(TEST_FILES_DIR, "bitcoin.pdf"),
  },
  audio: {
    name: "sounds-of-mars.wav",
    contentType: "audio/wav",
    filePath: path.join(
      TEST_FILES_DIR,
      "sounds-of-mars-one-small-step-earth.wav",
    ),
  },
};

// Deterministic trace IDs for media test traces
export const MEDIA_TEST_TRACE_IDS = {
  imageOnly: "seed-media-image-only",
  allTypes: "seed-media-all-types",
  allTypesChatML: "seed-media-all-types-chatml",
} as const;

/**
 * Derive media ID from SHA256 hash (first 22 chars, URL-safe)
 */
function getMediaIdFromHash(sha256Hash: string): string {
  const urlSafeHash = sha256Hash.replaceAll("+", "-").replaceAll("/", "_");
  return urlSafeHash.slice(0, 22);
}

/**
 * Get bucket path for a media file
 */
function getBucketPath(
  projectId: string,
  mediaId: string,
  contentType: string,
): string {
  const extensionMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "application/pdf": "pdf",
    "audio/wav": "wav",
    "audio/mpeg": "mp3",
  };
  const extension = extensionMap[contentType] || "bin";
  const prefix = env.LANGFUSE_S3_MEDIA_UPLOAD_PREFIX || "";
  return `${prefix}${projectId}/${mediaId}.${extension}`;
}

/**
 * Upload a media file to storage and create database records
 */
async function uploadAndCreateMediaRecord(
  projectId: string,
  traceId: string,
  field: "input" | "output" | "metadata",
  mediaFile: MediaFile,
): Promise<void> {
  // Check if bucket is configured
  if (!env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    logger.warn(
      "[seed-media] LANGFUSE_S3_MEDIA_UPLOAD_BUCKET not configured, skipping media seeding",
    );
    return;
  }

  // Check if file exists
  if (!fs.existsSync(mediaFile.filePath)) {
    logger.warn(
      `[seed-media] Test file not found: ${mediaFile.filePath}, skipping`,
    );
    return;
  }

  const fileBytes = fs.readFileSync(mediaFile.filePath);
  const sha256Hash = crypto
    .createHash("sha256")
    .update(fileBytes)
    .digest("base64");
  const mediaId = getMediaIdFromHash(sha256Hash);
  const bucketPath = getBucketPath(projectId, mediaId, mediaFile.contentType);

  // Check if media already exists
  const existingMedia = await prisma.media.findUnique({
    where: {
      projectId_sha256Hash: {
        projectId,
        sha256Hash,
      },
    },
  });

  if (existingMedia && existingMedia.uploadHttpStatus === 200) {
    logger.debug(
      `[seed-media] Media already exists for ${mediaFile.name}, creating TraceMedia link only`,
    );

    // Just create the TraceMedia link
    await prisma.$queryRaw`
      INSERT INTO "trace_media" ("id", "project_id", "trace_id", "media_id", "field")
      VALUES (${crypto.randomUUID()}, ${projectId}, ${traceId}, ${existingMedia.id}, ${field})
      ON CONFLICT DO NOTHING;
    `;
    return;
  }

  // Upload to storage
  try {
    const storageClient = StorageServiceFactory.getInstance({
      bucketName: env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET,
      accessKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID,
      secretAccessKey: env.LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY,
      endpoint: env.LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT,
      region: env.LANGFUSE_S3_MEDIA_UPLOAD_REGION,
      forcePathStyle: env.LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE === "true",
      awsSse: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE,
      awsSseKmsKeyId: env.LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID,
    });

    await storageClient.uploadFile({
      fileName: bucketPath,
      fileType: mediaFile.contentType,
      data: Readable.from(fileBytes),
    });

    logger.debug(`[seed-media] Uploaded ${mediaFile.name} to ${bucketPath}`);
  } catch (error) {
    logger.error(`[seed-media] Failed to upload ${mediaFile.name}:`, error);
    return;
  }

  // Create Media record
  await prisma.$queryRaw`
    INSERT INTO "media" (
      "id",
      "project_id",
      "sha_256_hash",
      "bucket_path",
      "bucket_name",
      "content_type",
      "content_length",
      "uploaded_at",
      "upload_http_status"
    )
    VALUES (
      ${mediaId},
      ${projectId},
      ${sha256Hash},
      ${bucketPath},
      ${env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET},
      ${mediaFile.contentType},
      ${BigInt(fileBytes.length)},
      ${new Date()},
      ${200}
    )
    ON CONFLICT ("project_id", "sha_256_hash")
    DO UPDATE SET
      "bucket_name" = ${env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET},
      "bucket_path" = ${bucketPath},
      "content_type" = ${mediaFile.contentType},
      "content_length" = ${BigInt(fileBytes.length)},
      "uploaded_at" = ${new Date()},
      "upload_http_status" = ${200}
  `;

  // Create TraceMedia link
  await prisma.$queryRaw`
    INSERT INTO "trace_media" ("id", "project_id", "trace_id", "media_id", "field")
    VALUES (${crypto.randomUUID()}, ${projectId}, ${traceId}, ${mediaId}, ${field})
    ON CONFLICT DO NOTHING;
  `;

  logger.info(
    `[seed-media] Created media record for ${mediaFile.name} -> ${field}`,
  );
}

/**
 * Seed media test traces for a project
 *
 * Creates two test traces with media attachments:
 * 1. Image only (in input)
 * 2. All types (image in input, PDF in output, audio in metadata)
 */
export async function seedMediaTraces(projectId: string): Promise<void> {
  logger.info(`[seed-media] Seeding media traces for project ${projectId}`);

  // Check if bucket is configured
  if (!env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET) {
    logger.warn(
      "[seed-media] LANGFUSE_S3_MEDIA_UPLOAD_BUCKET not configured, skipping media seeding",
    );
    return;
  }

  // Trace 1: Image only (input)
  const trace1Id = MEDIA_TEST_TRACE_IDS.imageOnly;
  await uploadAndCreateMediaRecord(
    projectId,
    trace1Id,
    "input",
    MEDIA_FILES.image,
  );

  // Trace 2: All media types
  const trace2Id = MEDIA_TEST_TRACE_IDS.allTypes;
  await uploadAndCreateMediaRecord(
    projectId,
    trace2Id,
    "input",
    MEDIA_FILES.image,
  );
  await uploadAndCreateMediaRecord(
    projectId,
    trace2Id,
    "output",
    MEDIA_FILES.pdf,
  );
  await uploadAndCreateMediaRecord(
    projectId,
    trace2Id,
    "metadata",
    MEDIA_FILES.audio,
  );

  // Trace 3: All media types with ChatML format (pretty-rendered)
  const trace3Id = MEDIA_TEST_TRACE_IDS.allTypesChatML;
  await uploadAndCreateMediaRecord(
    projectId,
    trace3Id,
    "input",
    MEDIA_FILES.image,
  );
  await uploadAndCreateMediaRecord(
    projectId,
    trace3Id,
    "output",
    MEDIA_FILES.pdf,
  );
  await uploadAndCreateMediaRecord(
    projectId,
    trace3Id,
    "metadata",
    MEDIA_FILES.audio,
  );

  logger.info("[seed-media] Media seeding completed");
}
