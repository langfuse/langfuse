import { describe, expect, it } from "vitest";

import { isObservationAllowedForQueuedObservationEvals } from "../scheduleObservationEvals";

const ROOT_SPAN_ID = "aaaaaaaaaaaaaaaa";
const CHILD_SPAN_ID = "bbbbbbbbbbbbbbbb";

describe("isObservationAllowedForQueuedObservationEvals", () => {
  it("allows user environments", () => {
    expect(
      isObservationAllowedForQueuedObservationEvals({
        environment: "default",
        span_id: CHILD_SPAN_ID,
        experiment_item_root_span_id: null,
      }),
    ).toBe(true);
    expect(
      isObservationAllowedForQueuedObservationEvals({
        environment: "production",
        span_id: CHILD_SPAN_ID,
        experiment_item_root_span_id: null,
      }),
    ).toBe(true);
  });

  it("blocks LLM-as-a-judge observations to prevent eval-on-eval recursion", () => {
    // LLM-as-a-judge executions publish their telemetry through the OTel
    // ingestion pipeline; scheduling evals on those observations would spawn
    // evals of evals indefinitely.
    expect(
      isObservationAllowedForQueuedObservationEvals({
        environment: "langfuse-llm-as-a-judge",
        span_id: ROOT_SPAN_ID,
        experiment_item_root_span_id: ROOT_SPAN_ID,
      }),
    ).toBe(false);
  });

  it("blocks other internal langfuse environments", () => {
    for (const environment of [
      "langfuse-code-eval",
      "langfuse-in-app-agent",
      "langfuse",
    ]) {
      expect(
        isObservationAllowedForQueuedObservationEvals({
          environment,
          span_id: ROOT_SPAN_ID,
          experiment_item_root_span_id: ROOT_SPAN_ID,
        }),
      ).toBe(false);
    }
  });

  it("allows experiment run-item root observations only", () => {
    expect(
      isObservationAllowedForQueuedObservationEvals({
        environment: "langfuse-prompt-experiment",
        span_id: ROOT_SPAN_ID,
        experiment_item_root_span_id: ROOT_SPAN_ID,
      }),
    ).toBe(true);
  });

  it("blocks experiment child observations", () => {
    expect(
      isObservationAllowedForQueuedObservationEvals({
        environment: "langfuse-prompt-experiment",
        span_id: CHILD_SPAN_ID,
        experiment_item_root_span_id: ROOT_SPAN_ID,
      }),
    ).toBe(false);
  });

  it("blocks experiment observations without root linkage", () => {
    expect(
      isObservationAllowedForQueuedObservationEvals({
        environment: "langfuse-prompt-experiment",
        span_id: ROOT_SPAN_ID,
        experiment_item_root_span_id: null,
      }),
    ).toBe(false);
    expect(
      isObservationAllowedForQueuedObservationEvals({
        environment: "langfuse-prompt-experiment",
        span_id: ROOT_SPAN_ID,
        experiment_item_root_span_id: undefined,
      }),
    ).toBe(false);
  });
});
