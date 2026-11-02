import { describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { readSkillArchive } from "./archive-import";
import { discoverLocalSkills } from "./local-import";

const markdown = (name: string) =>
  `---\nname: ${name}\ndescription: Example skill\n---\nInstructions`;
describe("ZIP skill discovery", () => {
  it("rejects a ZIP whose actual expansion exceeds its forged size", () => {
    const archive = zipSync({
      "SKILL.md": strToU8(markdown("root") + "x".repeat(1024 * 1024)),
    });
    const view = new DataView(
      archive.buffer,
      archive.byteOffset,
      archive.byteLength,
    );
    for (let offset = 0; offset < archive.byteLength - 28; offset++) {
      const signature = view.getUint32(offset, true);
      if (signature === 0x02014b50) view.setUint32(offset + 24, 36, true);
      if (signature === 0x04034b50) view.setUint32(offset + 22, 36, true);
    }
    expect(() => readSkillArchive(archive)).toThrow("ZIP");
  });
});

describe("local skill discovery", () => {
  const input = (path: string, bytes: Uint8Array) => {
    const file = new File([], path.split("/").at(-1)!);
    Object.defineProperty(file, "size", { value: bytes.byteLength });
    const read = vi.fn(async () => bytes.slice().buffer);
    Object.defineProperty(file, "arrayBuffer", { value: read });
    return { path, file, read };
  };

  it("preserves folder resources and combines files and ZIPs without reading unrelated files", async () => {
    const unrelated = input(
      "repo/src/large.bin",
      new Uint8Array(4 * 1024 * 1024),
    );
    const result = await discoverLocalSkills([
      input("repo/skills/review/SKILL.md", strToU8(markdown("review"))),
      input("repo/skills/review/references/checklist.md", strToU8("Checklist")),
      unrelated,
      input(
        "other.zip",
        zipSync({ "write/SKILL.md": strToU8(markdown("write")) }),
      ),
    ]);
    expect(unrelated.read).not.toHaveBeenCalled();
    expect(result).toMatchObject([
      {
        name: "review",
        path: "repo/skills/review",
        error: null,
        files: [
          { path: "SKILL.md", content: markdown("review") },
          { path: "references/checklist.md", content: "Checklist" },
        ],
      },
      { name: "write", path: "other/write", error: null },
    ]);
  });
});
