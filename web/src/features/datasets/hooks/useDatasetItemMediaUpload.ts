import { Sha256 } from "@aws-crypto/sha256-browser";
import { useCallback, useState } from "react";
import { v4 as uuidv4 } from "uuid";

import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { MediaContentType } from "@/src/features/media/validation";
import { api } from "@/src/utils/api";
import { type DatasetItemMediaField } from "@langfuse/shared";

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
  // Sha256 uses Web Crypto when available and falls back to a pure-JS
  // implementation, so hashing also works on non-secure (HTTP) origins where
  // crypto.subtle is unavailable.
  const hash = new Sha256();
  hash.update(new Uint8Array(buffer));
  const digest = await hash.digest();
  let binary = "";
  for (const byte of digest) {
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
  datasetId,
  datasetItemId,
}: {
  projectId: string;
  datasetId: string;
  // The item this upload is for. The item need not exist yet (the create form
  // generates the id up front); the association is claimed when it is written.
  datasetItemId: string;
}) {
  const [pendingUploads, setPendingUploads] = useState<PendingMediaUpload[]>(
    [],
  );

  // Lets callers drop stale placeholders when reusing the hook across items
  // (e.g. the edit dialog, whose hook outlives the per-item dialog content).
  const resetPendingUploads = useCallback(() => setPendingUploads([]), []);

  const getUploadUrl = api.datasets.getItemMediaUploadUrl.useMutation();
  const markUploadComplete =
    api.datasets.markItemMediaUploadComplete.useMutation();

  const uploadFile = useCallback(
    async (
      file: File,
      field: DatasetItemMediaField,
    ): Promise<string | null> => {
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

      // uuid's v4() falls back to crypto.getRandomValues, so it works on
      // non-secure (HTTP) origins where crypto.randomUUID is unavailable.
      const pendingId = uuidv4();
      setPendingUploads((prev) => [
        ...prev,
        { id: pendingId, fileName: file.name },
      ]);

      try {
        const buffer = await file.arrayBuffer();
        const sha256Hash = await sha256Base64(buffer);

        const { mediaId, uploadUrl, uploadHeaders } =
          await getUploadUrl.mutateAsync({
            projectId,
            datasetId,
            datasetItemId,
            field,
            contentType: file.type as MediaContentType,
            contentLength: file.size,
            sha256Hash,
          });

        // uploadUrl is null when the content already exists (dedupe by hash)
        if (uploadUrl) {
          const uploadStart = Date.now();
          const headers = new Headers({ "Content-Type": file.type });
          Object.entries(uploadHeaders).forEach(([key, value]) => {
            if (value) headers.set(key, value);
          });

          const response = await fetch(uploadUrl, {
            method: "PUT",
            body: file,
            headers,
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
    [projectId, datasetId, datasetItemId, getUploadUrl, markUploadComplete],
  );

  return { uploadFile, pendingUploads, resetPendingUploads };
}
