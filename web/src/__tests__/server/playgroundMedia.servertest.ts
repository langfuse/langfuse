import crypto from "crypto";

import {
  createMediaUploadUrl,
  updateMediaUploadStatus,
} from "@/src/features/media/server/mediaService";
import { resolveMessageMedia } from "@/src/features/media/server/resolveMessageMedia";
import { prisma } from "@langfuse/shared/src/db";
import {
  buildMediaReferenceString,
  ChatMessageRole,
  ChatMessageType,
  type ChatMessage,
} from "@langfuse/shared";
import { MediaContentType } from "@/src/features/media/validation";

// End-to-end backend verification of the playground media flow against the real
// running services (Postgres + MinIO): a trace-less media upload (as the
// server-side upload handler performs it) and base64 resolution via the new
// downloadBytes. The HTTP handler is thin glue over these functions.
describe("Playground media (trace-less upload + resolution)", () => {
  const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

  it("uploads media without a trace link and resolves it to base64", async () => {
    // Unique bytes -> unique sha256 -> unique mediaId (no dedupe collisions).
    const fileBytes = crypto.randomBytes(2048);
    const contentType = MediaContentType.PNG;
    const sha256Hash = crypto
      .createHash("sha256")
      .update(fileBytes)
      .digest("base64");

    // 1) Create the upload URL without a traceId/field (in-app upload).
    const { mediaId, uploadUrl } = await createMediaUploadUrl({
      projectId,
      body: {
        contentType,
        contentLength: fileBytes.length,
        sha256Hash,
      },
    });
    expect(mediaId).toBeTruthy();
    expect(uploadUrl).toBeTruthy();

    // 2) Server-side PUT to storage (same contract as the SDK / public API).
    const putResponse = await fetch(uploadUrl as string, {
      method: "PUT",
      body: fileBytes,
      headers: {
        "Content-Type": contentType,
        "X-Amz-Checksum-Sha256": sha256Hash,
      },
    });
    expect(putResponse.ok).toBe(true);

    // 3) Mark the upload complete.
    await updateMediaUploadStatus({
      projectId,
      mediaId,
      body: {
        uploadedAt: new Date(),
        uploadHttpStatus: putResponse.status,
      },
    });

    // The media row exists and is NOT linked to any trace/observation.
    const mediaRow = await prisma.media.findUnique({
      where: { projectId_id: { projectId, id: mediaId } },
    });
    expect(mediaRow?.uploadHttpStatus).toBe(200);

    expect(
      await prisma.traceMedia.count({ where: { projectId, mediaId } }),
    ).toBe(0);
    expect(
      await prisma.observationMedia.count({ where: { projectId, mediaId } }),
    ).toBe(0);

    // 4) Resolve the message media -> inline base64 (round-trips the bytes).
    const message: ChatMessage = {
      type: ChatMessageType.User,
      role: ChatMessageRole.User,
      content: [
        { type: "text", text: "what is in this image?" },
        {
          type: "media",
          mediaId,
          mimeType: contentType,
          reference: buildMediaReferenceString({
            mediaId,
            mimeType: contentType,
          }),
        },
      ],
    };

    const [resolved] = await resolveMessageMedia({
      projectId,
      messages: [message],
    });

    const resolvedMediaPart = (resolved.content as any[]).find(
      (p) => p.type === "media",
    );
    expect(resolvedMediaPart.data).toBe(fileBytes.toString("base64"));
    expect(resolvedMediaPart.mimeType).toBe(contentType);
    expect((resolved.content as any[])[0]).toEqual({
      type: "text",
      text: "what is in this image?",
    });
  });
});
