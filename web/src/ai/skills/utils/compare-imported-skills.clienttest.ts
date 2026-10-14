import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { compareImportedSkills } from "./compare-imported-skills";

const files = [
  { path: "SKILL.md", content: "Instructions" },
  { path: "references/notes.md", content: "Notes" },
];
const existing = [
  {
    name: "existing-skill",
    files: files.map(({ path, content }) => ({
      path,
      sha256Hash: createHash("sha256").update(content, "utf8").digest("base64"),
    })),
  },
];

describe("browser skill comparison", () => {
  it("matches saved backend hashes independent of order and detects supporting file changes", async () => {
    const skill = {
      name: "existing-skill",
      path: "skill",
      description: "Example",
      files: [...files].reverse(),
      error: null,
    };
    const [unchanged] = await compareImportedSkills([skill], existing);
    expect(unchanged).toMatchObject({ exists: true, hasChanges: false });
    const [changed] = await compareImportedSkills(
      [{ ...skill, files: [files[0]!, { ...files[1]!, content: "Changed" }] }],
      existing,
    );
    expect(changed).toMatchObject({ exists: true, hasChanges: true });
  });
});
