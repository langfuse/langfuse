import { getPromptDetailHref } from "@/src/features/prompts/utils";

describe("getPromptDetailHref", () => {
  it("builds the detail href for a plain prompt name", () => {
    expect(getPromptDetailHref("project-1", "my-prompt")).toBe(
      "/project/project-1/prompts/my-prompt",
    );
  });

  it("encodes slash-grouped (folder) names as a single path segment", () => {
    expect(getPromptDetailHref("project-1", "folder/sub/prompt")).toBe(
      "/project/project-1/prompts/folder%2Fsub%2Fprompt",
    );
  });

  it("never emits an empty path segment for leading-slash names", () => {
    const href = getPromptDetailHref("project-1", "/prompt");
    expect(href).toBe("/project/project-1/prompts/%2Fprompt");
    expect(href).not.toContain("//");
  });

  it("never emits an empty path segment for names with empty segments", () => {
    const href = getPromptDetailHref("project-1", "a//b");
    expect(href).toBe("/project/project-1/prompts/a%2F%2Fb");
    expect(href).not.toContain("//");
  });

  it("encodes characters that would break the path or query", () => {
    expect(getPromptDetailHref("project-1", "a?b#c d")).toBe(
      "/project/project-1/prompts/a%3Fb%23c%20d",
    );
  });
});
