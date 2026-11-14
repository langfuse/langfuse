import { describe, expect, it } from "vitest";

import { parsePromptDependencyTags } from "./parsePromptDependencyTags";

describe("parsePromptDependencyTags", () => {
  it("parses a version dependency with a '=' in the prompt name", () => {
    // PromptNameSchema only bans '|' (PROMPT_NAME_PIPE_RESTRICTION_REGEX),
    // so a name like "my=model" is valid — the tag parser must not treat the
    // first '=' after the key as the end of the value, or composed prompts
    // resolve a dependency on the truncated name instead.
    expect(
      parsePromptDependencyTags("@@@langfusePrompt:name=my=model|version=3@@@"),
    ).toEqual([{ name: "my=model", type: "version", version: 3 }]);
  });

  it("parses a label dependency with a '=' in the prompt name", () => {
    expect(
      parsePromptDependencyTags(
        "@@@langfusePrompt:name=my=model|label=production@@@",
      ),
    ).toEqual([{ name: "my=model", type: "label", label: "production" }]);
  });

  it("still parses plain names, versions and labels", () => {
    expect(
      parsePromptDependencyTags("@@@langfusePrompt:name=simple|version=2@@@"),
    ).toEqual([{ name: "simple", type: "version", version: 2 }]);

    expect(
      parsePromptDependencyTags(
        "@@@langfusePrompt:name=simple|label=production@@@",
      ),
    ).toEqual([{ name: "simple", type: "label", label: "production" }]);
  });
});
