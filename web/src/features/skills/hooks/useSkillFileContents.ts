import { skipToken, useQuery } from "@tanstack/react-query";
import { type SkillDraftFile } from "@/src/features/skills/components/skillEditorStore";
import { api } from "@/src/utils/api";

export function useSkillFileContents(projectId: string, file: SkillDraftFile) {
  const utils = api.useUtils();
  const source = file.source;
  return useQuery({
    queryKey: ["skillFileContent", projectId, source?.blobId],
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    meta: { silentAllErrors: true },
    enabled: typeof window !== "undefined" && Boolean(source),
    queryFn: source
      ? async ({ signal }) => {
          const { downloadUrl } = await utils.client.skills.fileDownload.query({
            projectId,
            fileId: source.fileId,
          });
          const response = await fetch(downloadUrl, {
            signal,
            credentials: "omit",
          });
          if (!response.ok) {
            throw new Error(`Skill file download failed (${response.status})`);
          }
          const bytes = await response.arrayBuffer();
          try {
            return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            throw new Error(
              "Skill file is not valid UTF-8 and cannot be edited in the UI",
            );
          }
        }
      : skipToken,
  });
}
