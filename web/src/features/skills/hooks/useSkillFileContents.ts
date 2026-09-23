import { skipToken, useQuery } from "@tanstack/react-query";
import { type SkillDraftFile } from "@/src/features/skills/components/skillEditorStore";
import { api } from "@/src/utils/api";
import { isSkillImageFile } from "../utils/isSkillImageFile";

const localBlobIds = new WeakMap<Blob, string>();

function localBlobId(blob: Blob): string {
  let id = localBlobIds.get(blob);
  if (!id) {
    id = crypto.randomUUID();
    localBlobIds.set(blob, id);
  }
  return id;
}

export function useSkillFileContents(projectId: string, file: SkillDraftFile) {
  const utils = api.useUtils();
  const source = file.source;
  const isImage = isSkillImageFile(file);
  const localTextBlob = !isImage ? file.blob : undefined;
  return useQuery({
    queryKey: [
      "skillFilePreview",
      projectId,
      source?.blobId ??
        (localTextBlob ? localBlobId(localTextBlob) : undefined),
      isImage ? "image" : "text",
    ],
    staleTime: isImage ? 5 * 60 * 1000 : Infinity,
    gcTime: 10 * 60 * 1000,
    meta: { silentAllErrors: true },
    enabled: typeof window !== "undefined" && Boolean(source || localTextBlob),
    queryFn:
      source || localTextBlob
        ? async ({ signal }) => {
            if (!source) {
              return {
                kind: "text" as const,
                text: await localTextBlob!.text(),
              };
            }
            const { downloadUrl } =
              await utils.client.skills.fileDownload.query({
                projectId,
                fileId: source.fileId,
              });
            if (isImage) return { kind: "image" as const, url: downloadUrl };
            const response = await fetch(downloadUrl, {
              signal,
              credentials: "omit",
            });
            if (!response.ok) {
              throw new Error(
                `Skill file download failed (${response.status})`,
              );
            }
            return { kind: "text" as const, text: await response.text() };
          }
        : skipToken,
  });
}
