import { buildSkillFileTree, getParentFolderPaths } from "./skillFileTree";

describe("skillFileTree", () => {
  it("builds a folder-first tree from file paths and empty draft folders", () => {
    expect(
      buildSkillFileTree(
        ["SKILL.md", "scripts/setup.sh", "references/api/auth.md"],
        ["examples"],
      ),
    ).toEqual([
      {
        kind: "folder",
        name: "examples",
        path: "examples",
        children: [],
      },
      {
        kind: "folder",
        name: "references",
        path: "references",
        children: [
          {
            kind: "folder",
            name: "api",
            path: "references/api",
            children: [
              {
                kind: "file",
                name: "auth.md",
                path: "references/api/auth.md",
              },
            ],
          },
        ],
      },
      {
        kind: "folder",
        name: "scripts",
        path: "scripts",
        children: [
          {
            kind: "file",
            name: "setup.sh",
            path: "scripts/setup.sh",
          },
        ],
      },
      { kind: "file", name: "SKILL.md", path: "SKILL.md" },
    ]);
  });

  it("returns every parent folder for nested paths", () => {
    expect(
      getParentFolderPaths([
        "SKILL.md",
        "references/api/auth.md",
        "references/examples.md",
      ]),
    ).toEqual(["references", "references/api"]);
  });
});
