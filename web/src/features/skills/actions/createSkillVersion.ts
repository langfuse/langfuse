import { CreateSkillVersionBodySchema } from "@langfuse/shared";
import { type SkillEditorStore } from "@/src/features/skills/components/skillEditorStore";
import { type RouterInputs } from "@/src/utils/api";

export async function createSkillVersionFromDraft(params: {
  projectId: string;
  store: SkillEditorStore;
  createVersion: (
    input: RouterInputs["skills"]["createVersion"],
  ) => Promise<{ id: string; name: string; version: number }>;
}) {
  const draft = params.store.getState();
  const files = Object.values(draft.files);
  const input = CreateSkillVersionBodySchema.parse({
    files: files.map((file) =>
      file.source
        ? { path: file.path, sha256Hash: file.source.sha256Hash }
        : { path: file.path, content: file.content },
    ),
    commitMessage: draft.commitMessage.trim() || null,
  });
  return params.createVersion({
    ...input,
    projectId: params.projectId,
  });
}
