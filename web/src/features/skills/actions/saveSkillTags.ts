import { type SkillEditorStore } from "@/src/features/skills/components/skillEditorStore";

export async function saveSkillTags(params: {
  projectId: string;
  name: string;
  version: number | null;
  tags: string[];
  store: SkillEditorStore;
  setTags: (input: {
    projectId: string;
    name: string;
    version: number;
    tags: string[];
  }) => Promise<unknown>;
  invalidate: () => Promise<unknown>;
}) {
  if (params.version === null) {
    params.store.getState().actions.setTags(params.tags);
    return;
  }

  await params.setTags({
    projectId: params.projectId,
    name: params.name,
    version: params.version,
    tags: params.tags,
  });
  params.store.getState().actions.syncTags(params.tags);
  await params.invalidate();
}
