import { type SkillEditorStore } from "@/src/features/skills/components/skillEditorStore";
import { SKILL_LATEST_LABEL } from "@langfuse/shared";

export async function saveSkillLabels(params: {
  projectId: string;
  name: string;
  version: number;
  labels: string[];
  store: SkillEditorStore;
  setLabels: (input: {
    projectId: string;
    name: string;
    version: number;
    labels: string[];
  }) => Promise<unknown>;
  invalidate: () => Promise<unknown>;
  getLabels: (version: number) => Promise<string[]>;
}) {
  await params.setLabels({
    projectId: params.projectId,
    name: params.name,
    version: params.version,
    labels: params.labels,
  });
  await params.invalidate();
  const selectedVersion = params.store.getState().baseVersion;
  if (selectedVersion !== null) {
    const labels = await params.getLabels(selectedVersion);
    params.store
      .getState()
      .actions.syncLabels(
        labels.filter((label) => label !== SKILL_LATEST_LABEL),
      );
  }
}
