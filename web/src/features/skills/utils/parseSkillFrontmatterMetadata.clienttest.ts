import { parseSkillFrontmatterMetadata } from "./parseSkillFrontmatterMetadata";

describe("parseSkillFrontmatterMetadata", () => {
  it("parses the skill name and description from valid frontmatter", () => {
    expect(
      parseSkillFrontmatterMetadata(
        "---\nname: incident-response\ndescription: Coordinate production incident response.\n---\n\n# Instructions\n",
      ),
    ).toEqual({
      name: "incident-response",
      description: "Coordinate production incident response.",
    });
  });

  it.each([
    "# Instructions\n",
    "---\nname: incident-response\ndescription:\n---\n",
    "---\nname: [invalid\ndescription: Invalid YAML\n---\n",
  ])("returns null while frontmatter is incomplete or invalid", (markdown) => {
    expect(parseSkillFrontmatterMetadata(markdown)).toBeNull();
  });
});
