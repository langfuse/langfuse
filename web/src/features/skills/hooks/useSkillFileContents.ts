import { type SkillDraftFile } from "@/src/features/skills/components/skillEditorStore";
import { api } from "@/src/utils/api";

export function useSkillFileContents(projectId: string, file: SkillDraftFile) {
  return api.skills.fileContents.useQuery(
    { projectId, sha256Hashes: file.sourceSha ? [file.sourceSha] : [] },
    {
      enabled: file.content === undefined && file.sourceSha !== null,
      select: (response) => response.data[0],
      staleTime: Infinity,
      gcTime: 10 * 60 * 1000,
      meta: { silentAllErrors: true },
    },
  );
}
