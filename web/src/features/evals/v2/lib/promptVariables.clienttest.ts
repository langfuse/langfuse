import { describe, expect, it } from "vitest";

import { removePromptVariable } from "./promptVariables";

describe("removePromptVariable", () => {
  it("removes every exact variable occurrence without touching similar names", () => {
    expect(
      removePromptVariable(
        "{{ score }} / {{score_detail}} / {{score}}",
        "score",
      ),
    ).toBe(" / {{score_detail}} / ");
  });
});
