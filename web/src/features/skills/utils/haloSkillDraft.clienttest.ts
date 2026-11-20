import {
  restoreSkillDraft,
  skillDraftStorageKey,
} from "@/src/features/skills/components/skillDraftStorage";
import { hashSkillFileContent } from "@/src/features/skills/utils/hashSkillFileContent";
import {
  editSkillDraftForHalo,
  readSkillDraftForHalo,
  saveSkillDraftForHalo,
} from "./haloSkillDraft";

const projectId = "project-1";

describe("Halo skill drafts", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("lets Halo and the user take turns on the draft of an existing skill", async () => {
    const referenceSha = await hashSkillFileContent("reference");
    const findLatestVersion = async (name: string) =>
      name === "triage"
        ? {
            id: "version-row-4",
            name: "triage",
            version: 4,
            labels: [],
            tags: [],
            files: [
              { path: "SKILL.md", sha256Hash: "skill-sha", contentLength: 9 },
              {
                path: "reference.md",
                sha256Hash: referenceSha,
                contentLength: 9,
              },
            ],
          }
        : null;

    // Halo only sends the file it changes; the other file stays.
    const first = await editSkillDraftForHalo(
      { projectId, findLatestVersion },
      {
        skillName: "triage",
        files: [{ path: "SKILL.md", content: "halo v1" }],
      },
    );
    expect(first.href).toBe(
      `/project/${projectId}/skills/triage?version=4&draft=true`,
    );

    // The editor resumes the same stored draft and the user edits it.
    const editor = restoreSkillDraft(skillDraftStorageKey(projectId, "triage"));
    editor!.store.getState().actions.selectFile("SKILL.md");
    editor!.store.getState().actions.updateActiveFile("user edit");

    await expect(
      readSkillDraftForHalo({ projectId }, { skillName: "triage" }),
    ).resolves.toMatchObject({
      status: "open",
      baseVersion: 4,
      files: [
        { path: "SKILL.md", status: "modified", content: "user edit" },
        { path: "reference.md", status: "unchanged" },
      ],
    });

    await editSkillDraftForHalo(
      { projectId, findLatestVersion },
      {
        skillName: "triage",
        files: [{ path: "notes.md", content: "added by halo" }],
      },
    );

    const createVersion = vi
      .fn()
      .mockResolvedValue({ id: "version-row-5", name: "triage", version: 5 });
    await expect(
      saveSkillDraftForHalo(
        { projectId, createVersion },
        { skillName: "triage" },
      ),
    ).resolves.toEqual({ status: "created", name: "triage", version: 5 });
    expect(createVersion).toHaveBeenCalledWith({
      projectId,
      files: [
        { path: "SKILL.md", content: "user edit" },
        { path: "reference.md", sha256Hash: referenceSha },
        { path: "notes.md", content: "added by halo" },
      ],
      commitMessage: null,
    });
    await expect(
      readSkillDraftForHalo({ projectId }, { skillName: "triage" }),
    ).resolves.toEqual({ status: "notFound" });
  });
});
