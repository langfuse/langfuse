import { describe, expect, it } from "vitest";

import { getInAppAgentTraceHref } from "./traceLink";

describe("getInAppAgentTraceHref", () => {
  it("builds the AI-features project path from the run id", () => {
    expect(
      getInAppAgentTraceHref({
        aiFeaturesProjectId: "ai-features",
        runId: "run-1",
      }),
    ).toBe("/project/ai-features/traces/run-1-trace");
  });

  it("returns nothing without a project or run", () => {
    expect(
      getInAppAgentTraceHref({
        aiFeaturesProjectId: undefined,
        runId: "run-1",
      }),
    ).toBeUndefined();
    expect(
      getInAppAgentTraceHref({
        aiFeaturesProjectId: "ai-features",
        runId: undefined,
      }),
    ).toBeUndefined();
  });
});
