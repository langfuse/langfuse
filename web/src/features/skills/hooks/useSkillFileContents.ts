import { type SkillDraftFile } from "@/src/features/skills/components/skillEditorStore";
import { api } from "@/src/utils/api";

export function useSkillFileContents(projectId: string, file: SkillDraftFile) {
  return api.skills.fileContent.useQuery(
    { projectId, fileId: file.source?.fileId ?? "" },
    {
      enabled: Boolean(file.source),
      staleTime: Infinity,
      gcTime: 10 * 60 * 1000,
      meta: { silentAllErrors: true },
    },
  );
}
