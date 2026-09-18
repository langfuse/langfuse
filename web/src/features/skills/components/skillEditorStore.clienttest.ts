import { describe, expect, it } from "vitest";
import { createSkillEditorStore } from "./skillEditorStore";

const initialValue = {
  name: "",
  baseVersion: null,
  labels: ["latest", "production"],
  tags: ["support"],
  files: [
    {
      path: "SKILL.md",
      content: "---\nname: my-skill\n---\n",
      contentType: "text/markdown",
      executable: false,
    },
  ],
};

describe("skillEditorStore", () => {
  it("keeps SKILL.md edits local", () => {
    const store = createSkillEditorStore(initialValue);

    store
      .getState()
      .actions.updateActiveFile("---\nname: support-triage\n---\n");

    expect(store.getState()).toMatchObject({
      dirty: true,
      labels: ["production"],
    });
    expect(store.getState().files["SKILL.md"]?.content).toContain(
      "name: support-triage",
    );
  });

  it("adds and removes files but keeps SKILL.md", () => {
    const store = createSkillEditorStore(initialValue);
    const reference = {
      path: "references/example.md",
      content: "Example",
      contentType: "text/markdown",
      executable: false,
    };

    expect(store.getState().actions.addFile(reference)).toBe(true);
    expect(store.getState().actions.addFile(reference)).toBe(false);
    expect(store.getState().activePath).toBe(reference.path);

    store.getState().actions.deleteFile(reference.path);
    store.getState().actions.deleteFile("SKILL.md");

    expect(Object.keys(store.getState().files)).toEqual(["SKILL.md"]);
    expect(store.getState().activePath).toBe("SKILL.md");
  });

  it("keeps empty folders in the local draft and prevents path collisions", () => {
    const store = createSkillEditorStore(initialValue);

    expect(store.getState().actions.addFolder("references")).toBe(true);
    expect(store.getState().actions.addFolder("references")).toBe(false);
    expect(
      store.getState().actions.addFile({
        path: "references",
        content: "",
        contentType: "text/plain",
        executable: false,
      }),
    ).toBe(false);

    expect(store.getState()).toMatchObject({
      folders: ["references"],
      dirty: true,
    });

    store.getState().actions.deleteFolder("references");
    expect(store.getState().folders).toEqual([]);
  });

  it("deduplicates controlled labels and tags", () => {
    const store = createSkillEditorStore(initialValue);

    store.getState().actions.setLabels(["production", "staging", "production"]);
    store.getState().actions.setTags(["support", "internal", "support"]);

    expect(store.getState()).toMatchObject({
      labels: ["production", "staging"],
      tags: ["support", "internal"],
      dirty: true,
    });
  });

  it("syncs persisted labels without making the version draft dirty", () => {
    const store = createSkillEditorStore(initialValue);

    store.getState().actions.syncLabels(["production", "staging"]);

    expect(store.getState()).toMatchObject({
      labels: ["production", "staging"],
      dirty: false,
    });
  });

  it("syncs persisted tags without making the version draft dirty", () => {
    const store = createSkillEditorStore(initialValue);

    store.getState().actions.syncTags(["support", "internal"]);

    expect(store.getState()).toMatchObject({
      tags: ["support", "internal"],
      dirty: false,
    });
  });
});
