import { useCallback, useState } from "react";

import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { MediaContentType } from "@/src/features/media/validation";
import { api } from "@/src/utils/api";

const SUPPORTED_CONTENT_TYPES = new Set<string>(
  Object.values(MediaContentType),
);

// Browser hashing uses file.arrayBuffer(), so keep this below the server-side
// media limit to avoid tab OOMs before the upload URL request can reject.
const MAX_BROWSER_MEDIA_UPLOAD_SIZE_MB = 100;
const MAX_BROWSER_MEDIA_UPLOAD_SIZE_BYTES =
  MAX_BROWSER_MEDIA_UPLOAD_SIZE_MB * 1024 * 1024;

export type PendingMediaUpload = { id: string; fileName: string };

async function sha256Base64(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  let binary = "";
  for (const byte of new Uint8Array(digest)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Runs a media upload for a dataset item attachment (hash -> presigned PUT ->
 * mark complete) and returns the `@@@langfuseMedia...@@@` reference string to
 * insert into the item JSON, or null on failure (surfaced via toast).
 *
 * Tracks in-flight uploads in `pendingUploads` so the attachment section can
 * show a placeholder regardless of entry point — attach button, drop, or paste
 * (the latter two bypass the button entirely).
 */
export function useDatasetItemMediaUpload({
  projectId,
}: {
  projectId: string;
}) {
  const [pendingUploads, setPendingUploads] = useState<PendingMediaUpload[]>(
    [],
  );

  const getUploadUrl = api.datasets.getItemMediaUploadUrl.useMutation();
  const markUploadComplete =
    api.datasets.markItemMediaUploadComplete.useMutation();

  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      if (!SUPPORTED_CONTENT_TYPES.has(file.type)) {
        showErrorToast(
          "Unsupported file type",
          `${file.type || "Unknown type"} is not supported for media uploads.`,
        );
        return null;
      }

      if (file.size > MAX_BROWSER_MEDIA_UPLOAD_SIZE_BYTES) {
        showErrorToast(
          "File too large",
          `Maximum file size is ${MAX_BROWSER_MEDIA_UPLOAD_SIZE_MB}MB`,
        );
        return null;
      }

      const pendingId = crypto.randomUUID();
      setPendingUploads((prev) => [
        ...prev,
        { id: pendingId, fileName: file.name },
      ]);

      try {
        const buffer = await file.arrayBuffer();
        const sha256Hash = await sha256Base64(buffer);

        const { mediaId, uploadUrl } = await getUploadUrl.mutateAsync({
          projectId,
          contentType: file.type as MediaContentType,
          contentLength: file.size,
          sha256Hash,
        });

        // uploadUrl is null when the content already exists (dedupe by hash)
        if (uploadUrl) {
          const uploadStart = Date.now();
          const response = await fetch(uploadUrl, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type,
              "x-amz-checksum-sha256": sha256Hash,
            },
          });

          await markUploadComplete.mutateAsync({
            projectId,
            mediaId,
            uploadedAt: new Date(),
            uploadHttpStatus: response.status,
            uploadHttpError: response.ok ? undefined : await response.text(),
            uploadTimeMs: Date.now() - uploadStart,
          });

          if (!response.ok) {
            throw new Error(`Upload failed with status ${response.status}`);
          }
        }

        return `@@@langfuseMedia:type=${file.type}|id=${mediaId}|source=bytes@@@`;
      } catch (error) {
        showErrorToast(
          "Media upload failed",
          error instanceof Error ? error.message : "Please try again.",
        );
        return null;
      } finally {
        setPendingUploads((prev) => prev.filter((u) => u.id !== pendingId));
      }
    },
    [projectId, getUploadUrl, markUploadComplete],
  );

  return { uploadFile, pendingUploads };
}
