import { describe, expect, it } from "vitest";

import { isEnvironmentAllowedForQueuedObservationEvals } from "../scheduleObservationEvals";

describe("isEnvironmentAllowedForQueuedObservationEvals", () => {
  it("allows user environments", () => {
    expect(isEnvironmentAllowedForQueuedObservationEvals("default")).toBe(true);
    expect(isEnvironmentAllowedForQueuedObservationEvals("production")).toBe(
      true,
    );
  });

  it("allows undefined environments (defaulted downstream)", () => {
    expect(isEnvironmentAllowedForQueuedObservationEvals(undefined)).toBe(true);
  });

  it("blocks all internal langfuse environments to prevent eval-on-eval recursion", () => {
    // LLM-as-a-judge executions publish their telemetry through the OTel
    // ingestion pipeline; scheduling evals on those observations would spawn
    // evals of evals indefinitely.
    expect(
      isEnvironmentAllowedForQueuedObservationEvals("langfuse-llm-judge"),
    ).toBe(false);
    expect(
      isEnvironmentAllowedForQueuedObservationEvals(
        "langfuse-prompt-experiment",
      ),
    ).toBe(false);
    expect(isEnvironmentAllowedForQueuedObservationEvals("langfuse")).toBe(
      false,
    );
  });
});
