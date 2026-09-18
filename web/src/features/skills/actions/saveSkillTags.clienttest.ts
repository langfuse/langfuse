import { expect, it, vi } from "vitest";
import { saveSkillTags } from "./saveSkillTags";
import { createSkillEditorStore } from "../components/skillEditorStore";

it("persists tags on an existing version without dirtying its draft", async () => {
  const store = createSkillEditorStore({
    name: "support-triage",
    baseVersion: 2,
    labels: ["production"],
    tags: ["support"],
    files: [
      {
        path: "SKILL.md",
        content: "# Support triage",
        contentType: "text/markdown",
        executable: false,
      },
    ],
  });
  const setTags = vi.fn(async () => undefined);
  const invalidate = vi.fn(async () => undefined);

  await saveSkillTags({
    projectId: "project-id",
    name: "support-triage",
    version: 2,
    tags: ["support", "internal"],
    store,
    setTags,
    invalidate,
  });

  expect(setTags).toHaveBeenCalledWith({
    projectId: "project-id",
    name: "support-triage",
    version: 2,
    tags: ["support", "internal"],
  });
  expect(store.getState()).toMatchObject({
    tags: ["support", "internal"],
    dirty: false,
  });
  expect(invalidate).toHaveBeenCalledOnce();
});
