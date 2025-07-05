import {
  createObservation,
  createObservationsCh,
} from "@langfuse/shared/src/server";
import { pruneDatabase } from "@/src/__tests__/test-utils";
import {
  getObservationMetricsForPrompts,
  getObservationsWithPromptName,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

describe("UI Prompts Table", () => {
  beforeEach(async () => {
    await pruneDatabase();
  });

  it("should count the observations which belong to a prompt", async () => {
    const observation = createObservation({
      id: v4(),
      project_id: projectId,
      trace_id: v4(),
      prompt_id: v4(),
      type: "GENERATION",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      is_deleted: 0,
      metadata: {
        some: "metadata",
      },
      start_time: Date.now(),
      provided_usage_details: {},
      provided_cost_details: {},
      usage_details: { input: 100, output: 200 },
      cost_details: { input: 100, output: 200 },
      name: "Test Observation",
      level: "WARNING",
      input: "some llm input",
      output: "some llm output",
      version: "1.2.0",
      parent_observation_id: null,
      status_message: "this is an error",
      provided_model_name: "anthropic",
      internal_model_id: "some-model-id",
      model_parameters: JSON.stringify({
        model: "test-model",
        model_version: "1",
        model_parameters: {},
      }),
      total_cost: 100,
      prompt_name: "Test Prompt",
      prompt_version: 1,
      end_time: Date.now(),
      completion_start_time: Date.now(),
    });

    const secondObservation = {
      ...observation,
      id: v4(),
      prompt_name: "Test Prompt 2",
    };
    const thirdObservation = {
      ...observation,
      id: v4(),
      prompt_name: null,
    };
    await createObservationsCh([
      observation,
      secondObservation,
      thirdObservation,
    ]);

    const result = await getObservationsWithPromptName(projectId, [
      "Test Prompt",
      "Test Prompt 2",
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        {
          promptName: "Test Prompt",
          count: 1,
        },
        {
          promptName: "Test Prompt 2",
          count: 1,
        },
      ]),
    );
  });

  it("should correctly calculate prompt metrics", async () => {
    const observation = createObservation({
      id: v4(),
      project_id: projectId,
      trace_id: v4(),
      type: "GENERATION",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      is_deleted: 0,
      metadata: {
        some: "metadata",
      },
      start_time: Date.now(),
      provided_usage_details: {},
      provided_cost_details: {},
      usage_details: { input: 100, output: 200 },
      cost_details: { input: 100, output: 200 },
      name: "Test Observation",
      level: "WARNING",
      input: "some llm input",
      output: "some llm output",
      version: "1.2.0",
      parent_observation_id: null,
      status_message: "this is an error",
      provided_model_name: "anthropic",
      internal_model_id: "some-model-id",
      model_parameters: JSON.stringify({
        model: "test-model",
        model_version: "1",
        model_parameters: {},
      }),
      total_cost: 100,
      prompt_name: "Test Prompt",
      prompt_version: 1,
      prompt_id: "some-prompt-id",
      end_time: Date.now(),
      completion_start_time: Date.now(),
    });

    const secondObservation = createObservation({
      ...observation,
      id: v4(),
      prompt_version: 2,
      usage_details: { input: 42, output: 5654 },
    });
    const thirdObservation = createObservation({
      ...observation,
      id: v4(),
      prompt_version: 2,
      cost_details: { input: 234, output: 755 },
    });
    await createObservationsCh([
      observation,
      secondObservation,
      thirdObservation,
    ]);

    const result = await getObservationMetricsForPrompts(projectId, [
      "some-prompt-id",
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        {
          count: 2,
          firstObservation: expect.any(Date),
          lastObservation: expect.any(Date),
          medianInputUsage: 100,
          medianLatencyMs: expect.any(Number),
          medianOutputUsage: 5654,
          medianTotalCost: 0,
          promptId: "some-prompt-id",
          promptVersion: 2,
        },
        {
          count: 1,
          firstObservation: expect.any(Date),
          lastObservation: expect.any(Date),
          medianInputUsage: 100,
          medianLatencyMs: expect.any(Number),
          medianOutputUsage: 200,
          medianTotalCost: 0,
          promptId: "some-prompt-id",
          promptVersion: 1,
        },
      ]),
    );
  });
});
