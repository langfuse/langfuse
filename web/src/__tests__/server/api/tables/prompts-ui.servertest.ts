import {
  createEvent,
  createEventsCh,
  createObservation,
  createObservationsCh,
  createScoresCh,
  createTraceScore,
} from "@langfuse/shared/src/server";
import {
  getAggregatedScoresForPromptsFromEvents,
  buildAggregatedScoresForPromptsFromEventsQuery,
  getObservationMetricsForPrompts,
  getObservationMetricsForPromptsFromEvents,
  getObservationsWithPromptName,
} from "@langfuse/shared/src/server";
import { env } from "@/src/env.mjs";
import { v4 } from "uuid";

const itIfEventsTable =
  env.LANGFUSE_MIGRATION_V4_ALLOW_PREVIEW_OPT_IN === "true" ? it : it.skip;

describe("UI Prompts Table", () => {
  it("should count the observations which belong to a prompt", async () => {
    const projectId = v4();
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

  it("should count observations for foldered prompts with full path", async () => {
    const projectId = v4();
    const folderedObservation = createObservation({
      id: v4(),
      project_id: projectId,
      trace_id: v4(),
      prompt_id: v4(),
      type: "GENERATION",
      created_at: Date.now(),
      updated_at: Date.now(),
      event_ts: Date.now(),
      is_deleted: 0,
      metadata: {},
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
      status_message: null,
      provided_model_name: "anthropic",
      internal_model_id: "some-model-id",
      model_parameters: null,
      total_cost: 100,
      prompt_name: "folder1/my-prompt", // Full path with folder
      prompt_version: 1,
      end_time: Date.now(),
      completion_start_time: Date.now(),
    });

    const secondFolderedObservation = {
      ...folderedObservation,
      id: v4(),
      prompt_name: "folder1/my-prompt", // Same foldered prompt
    };

    const thirdFolderedObservation = {
      ...folderedObservation,
      id: v4(),
      prompt_name: "folder2/another-prompt", // Different folder
    };

    await createObservationsCh([
      folderedObservation,
      secondFolderedObservation,
      thirdFolderedObservation,
    ]);

    const result = await getObservationsWithPromptName(projectId, [
      "folder1/my-prompt",
      "folder2/another-prompt",
    ]);

    expect(result).toEqual(
      expect.arrayContaining([
        {
          promptName: "folder1/my-prompt",
          count: 2, // Should count both observations
        },
        {
          promptName: "folder2/another-prompt",
          count: 1,
        },
      ]),
    );
  });

  it("should filter prompt observation counts by date range", async () => {
    const projectId = v4();
    const promptId = v4();

    const olderObservation = createObservation({
      id: v4(),
      project_id: projectId,
      trace_id: v4(),
      prompt_id: promptId,
      type: "GENERATION",
      created_at: Date.parse("2026-01-01T00:00:00.000Z"),
      updated_at: Date.parse("2026-01-01T00:00:00.000Z"),
      event_ts: Date.parse("2026-01-01T00:00:00.000Z"),
      is_deleted: 0,
      metadata: {},
      start_time: Date.parse("2026-01-01T00:00:00.000Z"),
      provided_usage_details: {},
      provided_cost_details: {},
      usage_details: { input: 100, output: 200 },
      cost_details: { input: 100, output: 200 },
      name: "Old Observation",
      level: "WARNING",
      input: "some llm input",
      output: "some llm output",
      version: "1.2.0",
      parent_observation_id: null,
      status_message: null,
      provided_model_name: "anthropic",
      internal_model_id: "some-model-id",
      model_parameters: null,
      total_cost: 100,
      prompt_name: "Test Prompt",
      prompt_version: 1,
      end_time: Date.parse("2026-01-01T00:00:01.000Z"),
      completion_start_time: Date.parse("2026-01-01T00:00:00.500Z"),
    });

    const newerObservation = createObservation({
      ...olderObservation,
      id: v4(),
      created_at: Date.parse("2026-01-03T00:00:00.000Z"),
      updated_at: Date.parse("2026-01-03T00:00:00.000Z"),
      event_ts: Date.parse("2026-01-03T00:00:00.000Z"),
      start_time: Date.parse("2026-01-03T00:00:00.000Z"),
      end_time: Date.parse("2026-01-03T00:00:01.000Z"),
      completion_start_time: Date.parse("2026-01-03T00:00:00.500Z"),
    });

    await createObservationsCh([olderObservation, newerObservation]);

    const result = await getObservationsWithPromptName(
      projectId,
      ["Test Prompt"],
      {
        fromTimestamp: new Date("2026-01-02T00:00:00.000Z"),
        toTimestamp: new Date("2026-01-03T00:00:00.000Z"),
      },
    );

    expect(result).toEqual([
      {
        promptName: "Test Prompt",
        count: 1,
      },
    ]);
  });

  it("should correctly calculate prompt metrics", async () => {
    const projectId = v4();
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

  itIfEventsTable(
    "should correctly calculate prompt metrics from events",
    async () => {
      const projectId = v4();
      const promptId = v4();
      const startTime = Date.parse("2026-07-16T13:42:33.028Z") * 1000;

      await createEventsCh([
        createEvent({
          project_id: projectId,
          trace_id: v4(),
          span_id: v4(),
          type: "GENERATION",
          prompt_id: promptId,
          prompt_name: "folder/test-prompt",
          prompt_version: 7,
          start_time: startTime,
          end_time: startTime + 2_000_000,
          usage_details: { input: 100, output: 200, total: 300 },
          cost_details: { input: 1, output: 2, total: 3 },
        }),
      ]);

      const result = await getObservationMetricsForPromptsFromEvents(
        projectId,
        [promptId],
      );

      expect(result).toEqual([
        {
          count: 1,
          firstObservation: new Date("2026-07-16T13:42:33.028Z"),
          lastObservation: new Date("2026-07-16T13:42:33.028Z"),
          medianInputUsage: 100,
          medianLatencyMs: 2000,
          medianOutputUsage: 200,
          medianTotalCost: 3,
          promptId,
          promptVersion: 7,
        },
      ]);
    },
  );

  itIfEventsTable(
    "should aggregate only the latest event version for prompt metrics",
    async () => {
      const projectId = v4();
      const promptId = v4();
      const traceId = v4();
      const spanId = v4();
      const startTime = Date.parse("2026-07-16T13:42:33.028Z") * 1000;
      const event = createEvent({
        project_id: projectId,
        trace_id: traceId,
        span_id: spanId,
        type: "GENERATION",
        prompt_id: promptId,
        prompt_name: "folder/test-prompt",
        prompt_version: 7,
        start_time: startTime,
        end_time: startTime + 1_000_000,
        event_ts: startTime,
        usage_details: { input: 100, output: 200, total: 300 },
        cost_details: { input: 1, output: 2, total: 3 },
      });

      await createEventsCh([event]);
      await createEventsCh([
        {
          ...event,
          end_time: startTime + 4_000_000,
          event_ts: startTime + 1_000_000,
          usage_details: { input: 400, output: 500, total: 900 },
          cost_details: { input: 4, output: 5, total: 9 },
        },
      ]);

      const result = await getObservationMetricsForPromptsFromEvents(
        projectId,
        [promptId],
      );

      expect(result).toEqual([
        expect.objectContaining({
          count: 1,
          medianInputUsage: 400,
          medianLatencyMs: 4000,
          medianOutputUsage: 500,
          medianTotalCost: 9,
        }),
      ]);
    },
  );

  itIfEventsTable("should fetch prompt scores from events", async () => {
    const projectId = v4();
    const promptId = v4();
    const traceId = v4();
    const spanId = v4();

    await Promise.all([
      createEventsCh([
        createEvent({
          project_id: projectId,
          trace_id: traceId,
          span_id: spanId,
          type: "GENERATION",
          prompt_id: promptId,
          prompt_name: "folder/test-prompt",
          prompt_version: 7,
        }),
      ]),
      createScoresCh([
        createTraceScore({
          id: v4(),
          project_id: projectId,
          trace_id: traceId,
          observation_id: spanId,
          name: "observation-score",
          value: 1,
        }),
        createTraceScore({
          id: v4(),
          project_id: projectId,
          trace_id: traceId,
          observation_id: null,
          name: "trace-score",
          value: 2,
        }),
      ]),
    ]);

    const [observationScores, traceScores] = await Promise.all([
      getAggregatedScoresForPromptsFromEvents(
        projectId,
        [promptId],
        "observation",
      ),
      getAggregatedScoresForPromptsFromEvents(projectId, [promptId], "trace"),
    ]);

    expect(observationScores).toEqual([
      expect.objectContaining({
        promptId,
        name: "observation-score",
        value: 1,
      }),
    ]);
    expect(traceScores).toEqual([
      expect.objectContaining({
        promptId,
        name: "trace-score",
        value: 2,
      }),
    ]);
  });

  it("should prefilter scores by prompt event identifiers before joining", () => {
    const { query } = buildAggregatedScoresForPromptsFromEventsQuery(
      v4(),
      [v4()],
      "observation",
    );

    expect(query).toContain("INNER JOIN prompt_events");
    expect(query).toContain(
      "(s.trace_id, s.observation_id) IN (SELECT trace_id, span_id FROM prompt_events",
    );
  });

  it("should filter prompt metrics by date range", async () => {
    const projectId = v4();
    const promptId = v4();

    const olderObservation = createObservation({
      id: v4(),
      project_id: projectId,
      trace_id: v4(),
      type: "GENERATION",
      created_at: Date.parse("2026-01-01T00:00:00.000Z"),
      updated_at: Date.parse("2026-01-01T00:00:00.000Z"),
      event_ts: Date.parse("2026-01-01T00:00:00.000Z"),
      is_deleted: 0,
      metadata: {},
      start_time: Date.parse("2026-01-01T00:00:00.000Z"),
      provided_usage_details: {},
      provided_cost_details: {},
      usage_details: { input: 100, output: 200 },
      cost_details: { total: 1 },
      name: "Old Observation",
      level: "WARNING",
      input: "some llm input",
      output: "some llm output",
      version: "1.2.0",
      parent_observation_id: null,
      status_message: null,
      provided_model_name: "anthropic",
      internal_model_id: "some-model-id",
      model_parameters: null,
      total_cost: 1,
      prompt_name: "Test Prompt",
      prompt_version: 1,
      prompt_id: promptId,
      end_time: Date.parse("2026-01-01T00:00:01.000Z"),
      completion_start_time: Date.parse("2026-01-01T00:00:00.500Z"),
    });

    const newerObservation = createObservation({
      ...olderObservation,
      id: v4(),
      created_at: Date.parse("2026-01-03T00:00:00.000Z"),
      updated_at: Date.parse("2026-01-03T00:00:00.000Z"),
      event_ts: Date.parse("2026-01-03T00:00:00.000Z"),
      start_time: Date.parse("2026-01-03T00:00:00.000Z"),
      end_time: Date.parse("2026-01-03T00:00:01.000Z"),
      completion_start_time: Date.parse("2026-01-03T00:00:00.500Z"),
      usage_details: { input: 300, output: 400 },
      cost_details: { total: 3 },
      total_cost: 3,
    });

    await createObservationsCh([olderObservation, newerObservation]);

    const result = await getObservationMetricsForPrompts(
      projectId,
      [promptId],
      {
        fromTimestamp: new Date("2026-01-02T00:00:00.000Z"),
        toTimestamp: new Date("2026-01-04T00:00:00.000Z"),
      },
    );

    expect(result).toEqual([
      {
        count: 1,
        firstObservation: new Date("2026-01-03T00:00:00.000Z"),
        lastObservation: new Date("2026-01-03T00:00:00.000Z"),
        medianInputUsage: 300,
        medianLatencyMs: 1000,
        medianOutputUsage: 400,
        medianTotalCost: 3,
        promptId,
        promptVersion: 1,
      },
    ]);
  });
});
