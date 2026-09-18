import { expect, it, vi } from "vitest";
import { saveSkillLabels } from "./saveSkillLabels";
import { createSkillEditorStore } from "../components/skillEditorStore";

it("persists labels on an existing version without dirtying its draft", async () => {
  const store = createSkillEditorStore({
    name: "support-triage",
    baseVersion: 2,
    labels: ["production"],
    tags: [],
    files: [
      {
        path: "SKILL.md",
        content: "# Support triage",
        contentType: "text/markdown",
        executable: false,
      },
    ],
  });
  const setLabels = vi.fn(async () => undefined);
  const invalidate = vi.fn(async () => undefined);

  await saveSkillLabels({
    projectId: "project-id",
    name: "support-triage",
    version: 2,
    labels: ["production", "staging"],
    store,
    setLabels,
    invalidate,
  });

  expect(setLabels).toHaveBeenCalledWith({
    projectId: "project-id",
    name: "support-triage",
    version: 2,
    labels: ["production", "staging"],
  });
  expect(store.getState()).toMatchObject({
    labels: ["production", "staging"],
    dirty: false,
  });
  expect(invalidate).toHaveBeenCalledOnce();
});
