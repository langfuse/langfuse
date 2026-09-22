import { type SkillEditorStore } from "@/src/features/skills/components/skillEditorStore";

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
}) {
  await params.setLabels({
    projectId: params.projectId,
    name: params.name,
    version: params.version,
    labels: params.labels,
  });
  params.store.getState().actions.syncLabels(params.labels);
  await params.invalidate();
}
