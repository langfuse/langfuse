import { describe, expect, it, vi } from "vitest";
import { createSkillVersionFromDraft } from "./createSkillVersion";
import { createSkillEditorStore } from "../components/skillEditorStore";

describe("createSkillVersionFromDraft", () => {
  it("prepares duplicate content once and reuses the blob for each file", async () => {
    const store = createSkillEditorStore({
      name: "support-triage",
      baseVersion: 1,
      labels: ["latest", "production"],
      tags: ["support"],
      files: [
        {
          path: "SKILL.md",
          content: "same content",
          contentType: "text/markdown",
          executable: false,
        },
        {
          path: "references/copy.md",
          content: "same content",
          contentType: "text/markdown",
          executable: false,
        },
      ],
    });
    store.getState().actions.setCommitMessage("Clarify instructions");
    const prepareUploads = vi.fn(
      async (input: {
        projectId: string;
        blobs: Array<{
          sha256Hash: string;
          contentType: string;
          contentLength: number;
        }>;
      }) => ({
        data: input.blobs.map((blob) => ({
          ...blob,
          blobId: "shared-blob",
          uploadUrl: null,
        })),
      }),
    );
    const createVersion = vi.fn(async (_input: unknown) => ({
      id: "skill-version",
      name: "support-triage",
      version: 2,
    }));

    await createSkillVersionFromDraft({
      projectId: "project-id",
      store,
      prepareUploads,
      createVersion,
    });

    expect(prepareUploads).toHaveBeenCalledWith({
      projectId: "project-id",
      blobs: [
        expect.objectContaining({
          contentType: "text/markdown",
          contentLength: 12,
        }),
      ],
    });
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: ["production"],
        tags: ["support"],
        commitMessage: "Clarify instructions",
        files: [
          expect.objectContaining({ blobId: "shared-blob", path: "SKILL.md" }),
          expect.objectContaining({
            blobId: "shared-blob",
            path: "references/copy.md",
          }),
        ],
      }),
    );
    expect(createVersion.mock.calls[0]![0]).not.toHaveProperty("name");
  });
});
