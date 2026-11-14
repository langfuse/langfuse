import { describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  LANGFUSE_SKILL_MAX_BYTES: 1_000_000,
  LANGFUSE_SKILL_MAX_FILES: 200,
}));

vi.mock("@/src/env.mjs", () => ({ env }));

import { getSkillRequestBodySizeLimit } from "@/src/features/skills/server/skill-request-body-limit";

describe("getSkillRequestBodySizeLimit", () => {
  it("keeps the 4.5mb floor at the default skill limit", () => {
    env.LANGFUSE_SKILL_MAX_BYTES = 1_000_000;
    expect(getSkillRequestBodySizeLimit()).toBe("4.5mb");
  });

  it("scales with the configured skill limit", () => {
    env.LANGFUSE_SKILL_MAX_BYTES = 10_000_000;
    expect(getSkillRequestBodySizeLimit()).toBe("21000000b");
    env.LANGFUSE_SKILL_MAX_BYTES = 1_000_000;
  });

  it("clears the floor once the limit is roughly doubled", () => {
    env.LANGFUSE_SKILL_MAX_BYTES = 2_000_000;
    expect(getSkillRequestBodySizeLimit()).toBe("5000000b");
    env.LANGFUSE_SKILL_MAX_BYTES = 1_000_000;
  });
});
