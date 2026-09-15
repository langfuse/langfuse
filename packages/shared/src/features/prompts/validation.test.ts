import { describe, expect, it } from "vitest";

import { RESERVED_PROMPT_NAMES } from "./constants";
import { PromptNameSchema } from "./validation";

describe("PromptNameSchema", () => {
  // The static /prompts/* pages (new, metrics, prompt-detail) beat the
  // [[...folder]] catch-all in Next.js routing, so a prompt with one of these
  // exact names would have every link to it resolve to the static page.
  it.each(RESERVED_PROMPT_NAMES)("rejects the reserved name '%s'", (name) => {
    const result = PromptNameSchema.safeParse(name);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      `Prompt name cannot be '${name}'`,
    );
  });

  it.each(RESERVED_PROMPT_NAMES)(
    "rejects '%s' with surrounding whitespace (compared after trim)",
    (name) => {
      expect(PromptNameSchema.safeParse(` ${name} `).success).toBe(false);
    },
  );

  // Only the exact single-segment name collides with the static routes:
  // "metrics/foo" (folder named metrics) and "foo/new" (leaf named new)
  // resolve through the catch-all. Deliberately not over-blocked.
  // Note: "folder/metrics" stays valid here; the catch-all's `/metrics`
  // URL-suffix handling is a separate, pre-existing quirk documented in
  // web/src/pages/project/[projectId]/prompts/[[...folder]].tsx.
  it.each(RESERVED_PROMPT_NAMES)(
    "allows '%s' as a folder name or leaf segment",
    (name) => {
      expect(PromptNameSchema.safeParse(`${name}/foo`).success).toBe(true);
      expect(PromptNameSchema.safeParse(`folder/${name}`).success).toBe(true);
    },
  );

  it("accepts ordinary prompt names", () => {
    for (const name of [
      "my-prompt",
      "metrics-v2",
      "new-onboarding",
      "folder/sub-folder/prompt",
    ]) {
      const result = PromptNameSchema.safeParse(name);
      expect(result.success).toBe(true);
      expect(result.data).toBe(name);
    }
  });

  it("still enforces the existing rules (pipe, slashes, emptiness)", () => {
    expect(PromptNameSchema.safeParse("a|b").success).toBe(false);
    expect(PromptNameSchema.safeParse("/a").success).toBe(false);
    expect(PromptNameSchema.safeParse("a/").success).toBe(false);
    expect(PromptNameSchema.safeParse("a//b").success).toBe(false);
    expect(PromptNameSchema.safeParse("").success).toBe(false);
  });

  it("trims surrounding whitespace from valid names", () => {
    expect(PromptNameSchema.safeParse(" my-prompt ").data).toBe("my-prompt");
  });
});
