import { strFromU8, unzipSync } from "fflate";
import { downloadSkillVersion } from "./downloadSkillVersion";

describe("downloadSkillVersion", () => {
  it("downloads and archives the explicitly selected skill version", async () => {
    const getVersion = vi.fn(async () => ({
      createdAt: new Date("2026-09-18T08:30:00.000Z"),
      files: [
        {
          path: "SKILL.md",
          downloadUrl: "https://storage.example/skill",
          executable: false,
        },
        {
          path: "scripts/run.sh",
          downloadUrl: "https://storage.example/run",
          executable: true,
        },
      ],
    }));
    const fetchFile = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        new TextEncoder().encode(
          url.endsWith("/skill") ? "# Instructions" : "#!/bin/sh\necho ok",
        ).buffer,
    }));
    const saveArchive = vi.fn();

    const result = await downloadSkillVersion({
      projectId: "project-id",
      name: "support-triage",
      version: 3,
      getVersion,
      fetchFile,
      saveArchive,
    });

    expect(getVersion).toHaveBeenCalledWith({
      projectId: "project-id",
      name: "support-triage",
      version: 3,
    });
    expect(result).toEqual({ fileCount: 2 });
    expect(saveArchive).toHaveBeenCalledOnce();
    expect(saveArchive.mock.calls[0]![1]).toBe("support-triage-v3.zip");

    const files = unzipSync(saveArchive.mock.calls[0]![0]);
    expect(strFromU8(files["SKILL.md"]!)).toBe("# Instructions");
    expect(strFromU8(files["scripts/run.sh"]!)).toBe("#!/bin/sh\necho ok");
  });
});
