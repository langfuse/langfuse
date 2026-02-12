import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractGenerationDetails,
  LangfuseInternalTraceEnvironment,
  type GenerationDetails,
} from "@langfuse/shared/src/server";
import type { ObservationForEval } from "../../evaluation/observationEval";

// Real events captured from an experiment run
// These events show the pattern: multiple generation-create and generation-update events with the same id
const realExperimentEvents = [
  {
    id: "669353e4-e6a5-451e-9eab-1b33c9e396d5",
    type: "trace-create",
    timestamp: "2026-01-31T06:58:02.221Z",
    body: {
      id: "4a56b6d74bbdffd08b9a2485f3315eeb",
      timestamp: "2026-01-31T06:58:02.218Z",
      environment: "langfuse-prompt-experiment",
      name: "dataset-run-item-008e4",
      metadata: {
        dataset_id: "cml1yj2ag0001xsej1fcv6vz8",
        dataset_item_id: "f0c467a1-539b-4e25-b41b-8db3ae399ef4",
        experiment_name: "Prompt Capital guesser-v1 on dataset countries",
        experiment_run_name:
          "Prompt Capital guesser-v1 on dataset countries - 2026-01-31T06:57:38.646Z",
      },
      input: [
        {
          content: "You are a euro capital guesser.",
          role: "system",
        },
        {
          content: "What is the capital of Germany?",
          role: "user",
        },
      ],
    },
  },
  {
    id: "632bcb55-2130-4b67-8a00-575106ab979e",
    type: "span-create",
    timestamp: "2026-01-31T06:58:02.221Z",
    body: {
      id: "4a56b6d74bbdffd08b9a2485f3315eeb",
      startTime: "2026-01-31T06:58:02.218Z",
      environment: "langfuse-prompt-experiment",
      traceId: "4a56b6d74bbdffd08b9a2485f3315eeb",
      name: "dataset-run-item-008e4",
      metadata: {
        dataset_id: "cml1yj2ag0001xsej1fcv6vz8",
        dataset_item_id: "f0c467a1-539b-4e25-b41b-8db3ae399ef4",
        experiment_name: "Prompt Capital guesser-v1 on dataset countries",
        experiment_run_name:
          "Prompt Capital guesser-v1 on dataset countries - 2026-01-31T06:57:38.646Z",
      },
      input: [
        {
          content: "You are a euro capital guesser.",
          role: "system",
        },
        {
          content: "What is the capital of Germany?",
          role: "user",
        },
      ],
    },
  },
  {
    id: "423fb5f6-1aa2-4285-ac05-03801ce32def",
    type: "generation-create",
    timestamp: "2026-01-31T06:58:02.222Z",
    body: {
      id: "d6f103ed-6ef6-4f83-a520-ab746e717360",
      startTime: "2026-01-31T06:58:02.220Z",
      environment: "langfuse-prompt-experiment",
      traceId: "4a56b6d74bbdffd08b9a2485f3315eeb",
      name: "ChatOpenAI",
      metadata: {
        tags: ["seq:step:1"],
        dataset_id: "cml1yj2ag0001xsej1fcv6vz8",
        dataset_item_id: "f0c467a1-539b-4e25-b41b-8db3ae399ef4",
        experiment_name: "Prompt Capital guesser-v1 on dataset countries",
        experiment_run_name:
          "Prompt Capital guesser-v1 on dataset countries - 2026-01-31T06:57:38.646Z",
        ls_provider: "openai",
        ls_model_name: "gpt-4.1",
        ls_model_type: "chat",
      },
      parentObservationId: "4a56b6d74bbdffd08b9a2485f3315eeb",
      input: [
        {
          content: "You are a euro capital guesser.",
          role: "system",
        },
        {
          content: "What is the capital of Germany?",
          role: "user",
        },
      ],
      model: "gpt-4.1",
      modelParameters: {},
    },
  },
  {
    id: "89688bd4-ec5c-4df3-830d-1588c6faa189",
    type: "generation-create",
    timestamp: "2026-01-31T06:58:02.230Z",
    body: {
      id: "d6f103ed-6ef6-4f83-a520-ab746e717360",
      startTime: "2026-01-31T06:58:02.220Z",
      environment: "langfuse-prompt-experiment",
      traceId: "4a56b6d74bbdffd08b9a2485f3315eeb",
      name: "ChatOpenAI",
      metadata: {
        tags: ["seq:step:1"],
        dataset_id: "cml1yj2ag0001xsej1fcv6vz8",
        dataset_item_id: "f0c467a1-539b-4e25-b41b-8db3ae399ef4",
        experiment_name: "Prompt Capital guesser-v1 on dataset countries",
        experiment_run_name:
          "Prompt Capital guesser-v1 on dataset countries - 2026-01-31T06:57:38.646Z",
        ls_provider: "openai",
        ls_model_name: "gpt-4.1",
        ls_model_type: "chat",
      },
      parentObservationId: "4a56b6d74bbdffd08b9a2485f3315eeb",
      input: [
        {
          content: "You are a euro capital guesser.",
          role: "system",
        },
        {
          content: "What is the capital of Germany?",
          role: "user",
        },
      ],
      model: "gpt-4.1",
      modelParameters: {},
    },
  },
  {
    id: "a7ec0f62-7e7b-4ed7-a179-099e588e4f88",
    type: "generation-update",
    timestamp: "2026-01-31T06:58:03.708Z",
    body: {
      id: "d6f103ed-6ef6-4f83-a520-ab746e717360",
      model: "gpt-4.1-2025-04-14",
      traceId: "4a56b6d74bbdffd08b9a2485f3315eeb",
      output: {
        content: "The capital of Germany is Berlin.",
        role: "assistant",
      },
      endTime: "2026-01-31T06:58:03.707Z",
      usage: {
        input: 26,
        output: 7,
        total: 33,
        input_audio: 0,
        input_cache_read: 0,
        output_audio: 0,
        output_reasoning: 0,
      },
      usageDetails: {
        input: 26,
        output: 7,
        total: 33,
        input_audio: 0,
        input_cache_read: 0,
        output_audio: 0,
        output_reasoning: 0,
      },
    },
  },
  {
    id: "2ae04b82-00bc-4dcb-a838-3857b87d5a48",
    type: "generation-update",
    timestamp: "2026-01-31T06:58:03.708Z",
    body: {
      id: "d6f103ed-6ef6-4f83-a520-ab746e717360",
      model: "gpt-4.1-2025-04-14",
      traceId: "4a56b6d74bbdffd08b9a2485f3315eeb",
      output: {
        content: "The capital of Germany is Berlin.",
        role: "assistant",
      },
      endTime: "2026-01-31T06:58:03.707Z",
      usage: {
        input: 26,
        output: 7,
        total: 33,
        input_audio: 0,
        input_cache_read: 0,
        output_audio: 0,
        output_reasoning: 0,
      },
      usageDetails: {
        input: 26,
        output: 7,
        total: 33,
        input_audio: 0,
        input_cache_read: 0,
        output_audio: 0,
        output_reasoning: 0,
      },
    },
  },
  {
    id: "8439a06a-4879-4b39-8014-1966c6a9b54d",
    type: "span-create",
    timestamp: "2026-01-31T06:58:03.709Z",
    body: {
      id: "8bd2ff9f-1d45-4240-9581-45a7190c77fd",
      startTime: "2026-01-31T06:58:03.708Z",
      environment: "langfuse-prompt-experiment",
      traceId: "4a56b6d74bbdffd08b9a2485f3315eeb",
      parentObservationId: "4a56b6d74bbdffd08b9a2485f3315eeb",
      name: "StrOutputParser",
      metadata: {
        tags: ["seq:step:2"],
        dataset_id: "cml1yj2ag0001xsej1fcv6vz8",
        dataset_item_id: "f0c467a1-539b-4e25-b41b-8db3ae399ef4",
        experiment_name: "Prompt Capital guesser-v1 on dataset countries",
        experiment_run_name:
          "Prompt Capital guesser-v1 on dataset countries - 2026-01-31T06:57:38.646Z",
      },
      input: "The capital of Germany is Berlin.",
    },
  },
  {
    id: "de27a791-209f-4008-bc16-617eb59c9914",
    type: "span-update",
    timestamp: "2026-01-31T06:58:03.709Z",
    body: {
      id: "8bd2ff9f-1d45-4240-9581-45a7190c77fd",
      traceId: "4a56b6d74bbdffd08b9a2485f3315eeb",
      output: "The capital of Germany is Berlin.",
      endTime: "2026-01-31T06:58:03.709Z",
    },
  },
  {
    id: "98f391e0-b74d-46c5-ae73-5899215b7915",
    type: "span-update",
    timestamp: "2026-01-31T06:58:03.710Z",
    body: {
      id: "4a56b6d74bbdffd08b9a2485f3315eeb",
      traceId: "4a56b6d74bbdffd08b9a2485f3315eeb",
      output: "The capital of Germany is Berlin.",
      endTime: "2026-01-31T06:58:03.709Z",
    },
  },
  {
    id: "f86aecdf-9a52-4c37-8ef1-0f5ab450eab1",
    type: "trace-create",
    timestamp: "2026-01-31T06:58:03.710Z",
    body: {
      id: "4a56b6d74bbdffd08b9a2485f3315eeb",
      timestamp: "2026-01-31T06:58:03.709Z",
      environment: "langfuse-prompt-experiment",
      output: "The capital of Germany is Berlin.",
      tags: [],
    },
  },
];

describe("extractGenerationDetails", () => {
  it("should extract and merge generation details from real experiment events", () => {
    const result = extractGenerationDetails(realExperimentEvents);

    expect(result).not.toBeNull();
    expect(result!.observationId).toBe("d6f103ed-6ef6-4f83-a520-ab746e717360");
    expect(result!.name).toBe("ChatOpenAI");

    // Input should come from generation-create events
    expect(result!.input).toEqual([
      { content: "You are a euro capital guesser.", role: "system" },
      { content: "What is the capital of Germany?", role: "user" },
    ]);

    // Output should come from generation-update events
    expect(result!.output).toEqual({
      content: "The capital of Germany is Berlin.",
      role: "assistant",
    });

    // Metadata should be merged from all generation events
    expect(result!.metadata).toEqual({
      tags: ["seq:step:1"],
      dataset_id: "cml1yj2ag0001xsej1fcv6vz8",
      dataset_item_id: "f0c467a1-539b-4e25-b41b-8db3ae399ef4",
      experiment_name: "Prompt Capital guesser-v1 on dataset countries",
      experiment_run_name:
        "Prompt Capital guesser-v1 on dataset countries - 2026-01-31T06:57:38.646Z",
      ls_provider: "openai",
      ls_model_name: "gpt-4.1",
      ls_model_type: "chat",
    });
  });

  it("should return null when no generation events are present", () => {
    const nonGenerationEvents = realExperimentEvents.filter(
      (e) => !e.type.startsWith("generation"),
    );

    const result = extractGenerationDetails(nonGenerationEvents);

    expect(result).toBeNull();
  });

  it("should return null for empty events array", () => {
    const result = extractGenerationDetails([]);

    expect(result).toBeNull();
  });

  it("should handle events without generation id", () => {
    const eventsWithoutId = [
      {
        type: "generation-create",
        body: { name: "test" }, // No id field
      },
    ];

    const result = extractGenerationDetails(eventsWithoutId);

    expect(result).toBeNull();
  });

  it("should merge metadata from multiple generation events", () => {
    const eventsWithDifferentMetadata = [
      {
        type: "generation-create",
        body: {
          id: "gen-1",
          name: "test",
          metadata: { key1: "value1" },
        },
      },
      {
        type: "generation-update",
        body: {
          id: "gen-1",
          metadata: { key2: "value2" },
        },
      },
    ];

    const result = extractGenerationDetails(eventsWithDifferentMetadata);

    expect(result!.metadata).toEqual({
      key1: "value1",
      key2: "value2",
    });
  });

  it("should use default name when name is not provided", () => {
    const eventsWithoutName = [
      {
        type: "generation-create",
        body: {
          id: "gen-1",
          // No name field
        },
      },
    ];

    const result = extractGenerationDetails(eventsWithoutName);

    expect(result!.name).toBe("generation");
  });
});

describe("buildObservationForEval", () => {
  // Helper function that mirrors the logic in scheduleExperimentObservationEvals
  function buildObservationForEval(params: {
    projectId: string;
    traceId: string;
    generationDetails: GenerationDetails;
    config: {
      runId: string;
      experimentName?: string;
      prompt?: { name: string; version: number };
    };
    datasetItem: {
      id: string;
      datasetId: string;
      expectedOutput?: unknown;
    };
  }): ObservationForEval {
    const { projectId, traceId, generationDetails, config, datasetItem } =
      params;

    return {
      // Identifiers
      span_id: generationDetails.observationId,
      trace_id: traceId,
      project_id: projectId,

      // Core properties
      type: "GENERATION",
      name: generationDetails.name || "generation",
      environment: LangfuseInternalTraceEnvironment.PromptExperiments,
      level: "DEFAULT",

      // Prompt info
      prompt_name: config.prompt?.name,
      prompt_version: config.prompt?.version,

      // Experiment fields - critical for matching
      experiment_id: config.runId,
      experiment_name: config.experimentName,
      experiment_dataset_id: datasetItem.datasetId,
      experiment_item_id: datasetItem.id,
      experiment_item_expected_output: datasetItem.expectedOutput
        ? JSON.stringify(datasetItem.expectedOutput)
        : null,
      experiment_item_root_span_id: generationDetails.observationId, // Same as span_id for root

      // Data fields
      input: generationDetails.input,
      output: generationDetails.output,
      metadata: generationDetails.metadata,

      // Empty defaults
      tags: [],
      provided_usage_details: {},
      provided_cost_details: {},
      usage_details: {},
      cost_details: {},
      tool_definitions: {},
      tool_calls: [],
      tool_call_names: [],
    };
  }

  it("should build correct ObservationForEval from real experiment events", () => {
    // Extract generation details from real events
    const generationDetails = extractGenerationDetails(realExperimentEvents)!;

    // Build ObservationForEval
    const observation = buildObservationForEval({
      projectId: "project-123",
      traceId: "4a56b6d74bbdffd08b9a2485f3315eeb",
      generationDetails,
      config: {
        runId: "run-456",
        experimentName: "Prompt Capital guesser-v1 on dataset countries",
        prompt: { name: "Capital guesser", version: 1 },
      },
      datasetItem: {
        id: "f0c467a1-539b-4e25-b41b-8db3ae399ef4",
        datasetId: "cml1yj2ag0001xsej1fcv6vz8",
        expectedOutput: { capital: "Berlin" },
      },
    });

    // Verify identifiers
    expect(observation.span_id).toBe("d6f103ed-6ef6-4f83-a520-ab746e717360");
    expect(observation.trace_id).toBe("4a56b6d74bbdffd08b9a2485f3315eeb");
    expect(observation.project_id).toBe("project-123");

    // Verify core properties
    expect(observation.type).toBe("GENERATION");
    expect(observation.name).toBe("ChatOpenAI");
    expect(observation.environment).toBe(
      LangfuseInternalTraceEnvironment.PromptExperiments,
    );
    expect(observation.level).toBe("DEFAULT");

    // Verify prompt info
    expect(observation.prompt_name).toBe("Capital guesser");
    expect(observation.prompt_version).toBe(1);

    // Verify experiment fields (critical for filter matching)
    expect(observation.experiment_id).toBe("run-456");
    expect(observation.experiment_name).toBe(
      "Prompt Capital guesser-v1 on dataset countries",
    );
    expect(observation.experiment_dataset_id).toBe("cml1yj2ag0001xsej1fcv6vz8");
    expect(observation.experiment_item_id).toBe(
      "f0c467a1-539b-4e25-b41b-8db3ae399ef4",
    );
    expect(observation.experiment_item_expected_output).toBe(
      JSON.stringify({ capital: "Berlin" }),
    );
    // Root span ID should equal span_id for experiment evals
    expect(observation.experiment_item_root_span_id).toBe(observation.span_id);

    // Verify data fields
    expect(observation.input).toEqual([
      { content: "You are a euro capital guesser.", role: "system" },
      { content: "What is the capital of Germany?", role: "user" },
    ]);
    expect(observation.output).toEqual({
      content: "The capital of Germany is Berlin.",
      role: "assistant",
    });

    // Verify metadata includes experiment context
    expect(observation.metadata).toEqual({
      tags: ["seq:step:1"],
      dataset_id: "cml1yj2ag0001xsej1fcv6vz8",
      dataset_item_id: "f0c467a1-539b-4e25-b41b-8db3ae399ef4",
      experiment_name: "Prompt Capital guesser-v1 on dataset countries",
      experiment_run_name:
        "Prompt Capital guesser-v1 on dataset countries - 2026-01-31T06:57:38.646Z",
      ls_provider: "openai",
      ls_model_name: "gpt-4.1",
      ls_model_type: "chat",
    });
  });

  it("should set experiment_item_root_span_id equal to span_id for root observations", () => {
    const generationDetails = extractGenerationDetails(realExperimentEvents)!;

    const observation = buildObservationForEval({
      projectId: "project-123",
      traceId: "trace-456",
      generationDetails,
      config: { runId: "run-789" },
      datasetItem: {
        id: "item-1",
        datasetId: "dataset-1",
      },
    });

    // This is critical for experiment eval filter matching
    // The filter checks: span_id === experiment_item_root_span_id
    expect(observation.experiment_item_root_span_id).toBe(observation.span_id);
  });

  it("should handle missing expectedOutput gracefully", () => {
    const generationDetails = extractGenerationDetails(realExperimentEvents)!;

    const observation = buildObservationForEval({
      projectId: "project-123",
      traceId: "trace-456",
      generationDetails,
      config: { runId: "run-789" },
      datasetItem: {
        id: "item-1",
        datasetId: "dataset-1",
        expectedOutput: undefined, // No expected output
      },
    });

    expect(observation.experiment_item_expected_output).toBeNull();
  });

  it("should handle missing prompt info gracefully", () => {
    const generationDetails = extractGenerationDetails(realExperimentEvents)!;

    const observation = buildObservationForEval({
      projectId: "project-123",
      traceId: "trace-456",
      generationDetails,
      config: {
        runId: "run-789",
        // No prompt provided
      },
      datasetItem: {
        id: "item-1",
        datasetId: "dataset-1",
      },
    });

    expect(observation.prompt_name).toBeUndefined();
    expect(observation.prompt_version).toBeUndefined();
  });
});
