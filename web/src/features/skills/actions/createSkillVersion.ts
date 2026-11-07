import {
  createCreateSkillVersionBodySchema,
  DEFAULT_SKILL_IMPORT_LIMITS,
  type SkillImportLimits,
} from "@langfuse/shared";
import { type SkillEditorStore } from "@/src/features/skills/components/skillEditorStore";
import { type RouterInputs } from "@/src/utils/api";

export async function createSkillVersionFromDraft(params: {
  projectId: string;
  store: SkillEditorStore;
  limits?: SkillImportLimits;
  createVersion: (
    input: RouterInputs["skills"]["createVersion"],
  ) => Promise<{ id: string; name: string; version: number }>;
}) {
  const draft = params.store.getState();
  const files = Object.values(draft.files);
  const input = createCreateSkillVersionBodySchema({
    maxSkillBytes: (params.limits ?? DEFAULT_SKILL_IMPORT_LIMITS).maxSkillBytes,
  }).parse({
    files: files.map((file) =>
      file.sourceSha !== null && file.currentSha === file.sourceSha
        ? { path: file.path, sha256Hash: file.sourceSha }
        : { path: file.path, content: file.content },
    ),
    commitMessage: draft.commitMessage.trim() || null,
  });
  return params.createVersion({
    ...input,
    projectId: params.projectId,
  });
}
