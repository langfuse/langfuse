import { useCallback, useState } from "react";

import { env } from "@/src/env.mjs";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import {
  MediaContentType,
  MediaFileExtension,
} from "@/src/features/media/validation";
import { type ChatMessageMediaContentPart } from "@langfuse/shared";

const CONTENT_TYPE_VALUES = new Set<string>(Object.values(MediaContentType));

/**
 * Best-effort content type for a file. Browsers usually set `file.type`, but
 * fall back to the extension for the handful of media types they leave blank.
 */
function resolveContentType(file: File): MediaContentType | null {
  if (file.type && CONTENT_TYPE_VALUES.has(file.type)) {
    return file.type as MediaContentType;
  }
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension) return null;
  const match = Object.entries(MediaFileExtension).find(
    ([, value]) => value === extension,
  );
  if (!match) return null;
  const byEnumKey = (MediaContentType as Record<string, string>)[match[0]];
  return byEnumKey && CONTENT_TYPE_VALUES.has(byEnumKey)
    ? (byEnumKey as MediaContentType)
    : null;
}

export function useMediaUpload(projectId: string) {
  const [isUploading, setIsUploading] = useState(false);

  const uploadFile = useCallback(
    async (file: File): Promise<ChatMessageMediaContentPart | null> => {
      const contentType = resolveContentType(file);
      if (!contentType || !contentType.startsWith("image/")) {
        showErrorToast(
          "Unsupported file type",
          "Only image files can currently be attached.",
        );
        return null;
      }

      try {
        // Upload to our own origin (allowed by CSP). The server performs the
        // actual storage upload, so we avoid browser->storage CORS/CSP issues.
        const response = await fetch(
          `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/playground/media?projectId=${encodeURIComponent(
            projectId,
          )}`,
          {
            method: "POST",
            headers: { "Content-Type": contentType },
            body: file,
          },
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message ?? `Upload failed with status ${response.status}`,
          );
        }

        const data = (await response.json()) as {
          mediaId: string;
          mimeType: string;
          reference: string;
        };

        return {
          type: "media",
          mediaId: data.mediaId,
          mimeType: data.mimeType,
          reference: data.reference,
        };
      } catch (error) {
        showErrorToast(
          "Failed to attach media",
          error instanceof Error ? error.message : "An error occurred",
        );
        return null;
      }
    },
    [projectId],
  );

  // Upload a batch of files, holding `isUploading` for the whole batch. Tracking
  // the flag here rather than inside `uploadFile` keeps the attach button
  // disabled until every file finishes; flipping it per file would briefly
  // re-enable the button between files and let a second batch race this one.
  const uploadFiles = useCallback(
    async (files: File[]): Promise<ChatMessageMediaContentPart[]> => {
      setIsUploading(true);
      try {
        const parts: ChatMessageMediaContentPart[] = [];
        for (const file of files) {
          const part = await uploadFile(file);
          if (part) parts.push(part);
        }
        return parts;
      } finally {
        setIsUploading(false);
      }
    },
    [uploadFile],
  );

  return { uploadFile, uploadFiles, isUploading };
}
