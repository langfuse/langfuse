import { afterEach, describe, expect, it, vi } from "vitest";
import { getSkillRequestBodySizeLimit } from "@/src/features/skills/server/skill-request-body-limit";

const env = vi.hoisted(() => ({
  LANGFUSE_SKILL_MAX_BYTES: 1_000_000,
  LANGFUSE_SKILL_MAX_FILES: 200,
}));

vi.mock("@/src/env.mjs", () => ({ env }));

afterEach(() => {
  env.LANGFUSE_SKILL_MAX_BYTES = 1_000_000;
});

describe("getSkillRequestBodySizeLimit", () => {
  it("keeps the 4.5mb floor for smaller configured limits", () => {
    env.LANGFUSE_SKILL_MAX_BYTES = 500_000;
    expect(getSkillRequestBodySizeLimit()).toBe("4.5mb");
  });

  it("accounts for worst-case JSON escaping at the default skill limit", () => {
    expect(getSkillRequestBodySizeLimit()).toBe("7048576b");
  });

  it("scales with the configured skill limit and worst-case JSON escaping", () => {
    env.LANGFUSE_SKILL_MAX_BYTES = 10_000_000;
    expect(getSkillRequestBodySizeLimit()).toBe("61048576b");
  });

  it("clears the floor once the scaled limit exceeds it", () => {
    env.LANGFUSE_SKILL_MAX_BYTES = 700_000;
    expect(getSkillRequestBodySizeLimit()).toBe("5248576b");
  });

  it("allows valid ASCII-escaped UTF-8 content above the old 2x limit", () => {
    env.LANGFUSE_SKILL_MAX_BYTES = 2_000_000;
    const escapedContent = "\\u00e9".repeat(1_000_000);
    const requestBody = `{"files":[{"path":"README.md","content":"${escapedContent}"}]}`;
    const parsed = JSON.parse(requestBody) as {
      files: Array<{ content: string }>;
    };
    const decodedContent = parsed.files[0]?.content ?? "";
    const bodyBytes = new TextEncoder().encode(requestBody).byteLength;
    const decodedBytes = new TextEncoder().encode(decodedContent).byteLength;
    const requestLimitBytes = Number.parseInt(
      getSkillRequestBodySizeLimit(),
      10,
    );

    expect(decodedBytes).toBe(2_000_000);
    expect(bodyBytes).toBeGreaterThan(5_048_576);
    expect(bodyBytes).toBeLessThanOrEqual(requestLimitBytes);
  });
});
