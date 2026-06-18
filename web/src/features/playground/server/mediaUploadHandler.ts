import { createHash } from "crypto";

import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/src/env.mjs";
import {
  createMediaUploadUrl,
  updateMediaUploadStatus,
} from "@/src/features/media/server/mediaService";
import { MediaContentType } from "@/src/features/media/validation";
import { authorizeRequestOrThrow } from "./authorizeRequest";
import {
  BaseError,
  buildMediaReferenceString,
  InvalidRequestError,
} from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";

const IMAGE_CONTENT_TYPES = new Set<string>(
  Object.values(MediaContentType).filter((type) => type.startsWith("image/")),
);

/**
 * Server-side media upload for the playground.
 *
 * The browser cannot upload directly to object storage: the app's CSP
 * `connect-src` does not allow the storage endpoint, and self-hosted/prod
 * buckets would each need their own CORS + CSP configuration. Instead the
 * browser POSTs the file to this same-origin endpoint and the server—which
 * already holds storage credentials—performs the upload. This mirrors how the
 * SDK uploads media (presigned URL + status PATCH), just executed server-side,
 * and creates a media record that is not linked to any trace.
 */
export default async function mediaUploadHandler(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      throw new InvalidRequestError("Missing projectId");
    }

    await authorizeRequestOrThrow(projectId);

    const contentType = req.headers.get("content-type")?.split(";")[0]?.trim();
    if (!contentType || !IMAGE_CONTENT_TYPES.has(contentType)) {
      throw new InvalidRequestError(
        "Unsupported content type. Only image files can currently be attached.",
      );
    }

    // Pre-check declared content length to avoid buffering obviously-oversized uploads.
    // Note: `Content-Length` may be absent or spoofed, so keep the post-buffer
    // check below as the authoritative guard.
    const declaredLengthHeader = req.headers.get("content-length");
    if (declaredLengthHeader) {
      const declaredLength = Number(declaredLengthHeader);
      if (
        !Number.isNaN(declaredLength) &&
        declaredLength > env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH
      ) {
        throw new InvalidRequestError(
          `File size must be less than ${env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH} bytes`,
        );
      }
    }

    const bytes = Buffer.from(await req.arrayBuffer());
    if (bytes.length === 0) {
      throw new InvalidRequestError("Empty file");
    }
    if (bytes.length > env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH) {
      throw new InvalidRequestError(
        `File size must be less than ${env.LANGFUSE_S3_MEDIA_MAX_CONTENT_LENGTH} bytes`,
      );
    }

    const sha256Hash = createHash("sha256").update(bytes).digest("base64");

    const { mediaId, uploadUrl } = await createMediaUploadUrl({
      projectId,
      body: {
        contentType: contentType as MediaContentType,
        contentLength: bytes.length,
        sha256Hash,
      },
    });

    // A null uploadUrl means the content already exists in storage (dedupe).
    if (uploadUrl) {
      const startedAt = Date.now();
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType,
          "x-amz-checksum-sha256": sha256Hash,
        },
        body: bytes,
      });

      if (!uploadResponse.ok) {
        throw new Error(
          `Storage upload failed with status ${uploadResponse.status}`,
        );
      }

      await updateMediaUploadStatus({
        projectId,
        mediaId,
        body: {
          uploadedAt: new Date(),
          uploadHttpStatus: uploadResponse.status,
          uploadTimeMs: Date.now() - startedAt,
        },
      });
    }

    return NextResponse.json({
      mediaId,
      mimeType: contentType,
      reference: buildMediaReferenceString({ mediaId, mimeType: contentType }),
    });
  } catch (err) {
    logger.error("Failed to handle playground media upload", err);

    if (err instanceof BaseError) {
      return NextResponse.json(
        { error: err.name, message: err.message },
        { status: err.httpCode },
      );
    }

    const message = err instanceof Error ? err.message : "An error occurred";
    return NextResponse.json(
      { error: "InternalServerError", message },
      { status: 500 },
    );
  }
}
