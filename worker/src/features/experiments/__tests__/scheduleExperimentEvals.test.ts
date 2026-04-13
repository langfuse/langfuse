import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  convertEventRecordToObservationForEval,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";
import {
  buildInternalTraceEventInputs,
  materializeInternalTrace,
  prepareInternalTraceEvents,
} from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";
import type { ObservationForEval } from "../../evaluation/observationEval";
import { IngestionService } from "../../../services/IngestionService";
import * as clickhouseWriterExports from "../../../services/ClickhouseWriter";
import { scheduleExperimentObservationEvals } from "../scheduleExperimentEvals";

const {
  mockAddToClickhouseWriter,
  mockFetchObservationEvalConfigs,
  mockCreateObservationEvalSchedulerDeps,
  mockScheduleObservationEvals,
} = vi.hoisted(() => ({
  mockAddToClickhouseWriter: vi.fn(),
  mockFetchObservationEvalConfigs: vi.fn(),
  mockCreateObservationEvalSchedulerDeps: vi.fn(),
  mockScheduleObservationEvals: vi.fn(),
}));

vi.mock("../../../services/ClickhouseWriter", async (importOriginal) => {
  const original = (await importOriginal()) as object;
  return {
    ...original,
    ClickhouseWriter: {
      getInstance: () => ({
        addToQueue: mockAddToClickhouseWriter,
      }),
    },
  };
});

vi.mock("../../evaluation/observationEval", async (importOriginal) => {
  const original = (await importOriginal()) as object;
  return {
    ...original,
    fetchObservationEvalConfigs: mockFetchObservationEvalConfigs,
    createObservationEvalSchedulerDeps: mockCreateObservationEvalSchedulerDeps,
    scheduleObservationEvals: mockScheduleObservationEvals,
  };
});

const mockClickhouseClient = {
  query: async () => ({
    json: async () => [],
    query_id: "test-query-id",
    response_headers: { "x-clickhouse-summary": "[]" },
  }),
};

const ingestionService = new IngestionService(
  null as any,
  prisma,
  clickhouseWriterExports.ClickhouseWriter.getInstance() as any,
  mockClickhouseClient as any,
);

const traceId = "4a56b6d74bbdffd08b9a2485f3315eeb";
const generationId = "d6f103ed-6ef6-4f83-a520-ab746e717360";
const blockedParserSpanId = "8bd2ff9f-1d45-4240-9581-45a7190c77fd";

const prompt = { name: "Capital guesser", version: 1 };

const datasetItem = {
  id: "f0c467a1-539b-4e25-b41b-8db3ae399ef4",
  datasetId: "cml1yj2ag0001xsej1fcv6vz8",
  validFrom: new Date("2026-01-31T06:57:38.646Z"),
  expectedOutput: { capital: "Berlin" },
  metadata: {
    region: "EU",
    difficulty: "easy",
  },
  input: {
    country: "Germany",
  },
} as any;

const config = {
  runId: "run-456",
  datasetRun: {
    name: "Prompt Capital guesser-v1 on dataset countries - 2026-01-31T06:57:38.646Z",
    description: "Prompt experiment run",
    metadata: {
      prompt_id: "prompt-123",
      provider: "openai",
      model: "gpt-4.1",
      model_params: {},
      experiment_name: "Prompt Capital guesser-v1 on dataset countries",
      experiment_run_name:
        "Prompt Capital guesser-v1 on dataset countries - 2026-01-31T06:57:38.646Z",
    },
  },
} as any;

// Real events captured from an experiment run.
const realExperimentEvents = [
  {
    id: "669353e4-e6a5-451e-9eab-1b33c9e396d5",
    type: "trace-create",
    timestamp: "2026-01-31T06:58:02.221Z",
    body: {
      id: traceId,
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
      id: traceId,
      startTime: "2026-01-31T06:58:02.218Z",
      environment: "langfuse-prompt-experiment",
      traceId,
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
      id: generationId,
      startTime: "2026-01-31T06:58:02.220Z",
      environment: "langfuse-prompt-experiment",
      traceId,
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
      parentObservationId: traceId,
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
      id: generationId,
      startTime: "2026-01-31T06:58:02.220Z",
      environment: "langfuse-prompt-experiment",
      traceId,
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
      parentObservationId: traceId,
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
      id: generationId,
      model: "gpt-4.1-2025-04-14",
      traceId,
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
      id: generationId,
      model: "gpt-4.1-2025-04-14",
      traceId,
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
      id: blockedParserSpanId,
      startTime: "2026-01-31T06:58:03.708Z",
      environment: "langfuse-prompt-experiment",
      traceId,
      parentObservationId: traceId,
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
      id: blockedParserSpanId,
      traceId,
      output: "The capital of Germany is Berlin.",
      endTime: "2026-01-31T06:58:03.709Z",
    },
  },
  {
    id: "98f391e0-b74d-46c5-ae73-5899215b7915",
    type: "span-update",
    timestamp: "2026-01-31T06:58:03.710Z",
    body: {
      id: traceId,
      traceId,
      output: "The capital of Germany is Berlin.",
      endTime: "2026-01-31T06:58:03.709Z",
    },
  },
  {
    id: "f86aecdf-9a52-4c37-8ef1-0f5ab450eab1",
    type: "trace-create",
    timestamp: "2026-01-31T06:58:03.710Z",
    body: {
      id: traceId,
      timestamp: "2026-01-31T06:58:03.709Z",
      environment: "langfuse-prompt-experiment",
      output: "The capital of Germany is Berlin.",
      tags: [],
    },
  },
];

function getProcessedExperimentEvents() {
  return prepareInternalTraceEvents({
    events: realExperimentEvents as any,
    environment: "langfuse-prompt-experiment",
    prompt,
  });
}

function getExperimentContext() {
  return {
    id: config.runId,
    name: config.datasetRun.name,
    metadata: config.datasetRun.metadata,
    description: config.datasetRun.description,
    datasetId: datasetItem.datasetId,
    itemId: datasetItem.id,
    itemVersion: datasetItem.validFrom
      .toISOString()
      .replace("T", " ")
      .replace("Z", ""),
    itemExpectedOutput: datasetItem.expectedOutput,
    itemMetadata: datasetItem.metadata,
  };
}

describe("prompt experiment direct-write materialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should filter parser spans and use the trace root as the experiment root", () => {
    const processedEvents = getProcessedExperimentEvents();
    const { rootSpanId, snapshots } = materializeInternalTrace({
      processedEvents,
      traceId,
    });

    expect(processedEvents.map((event) => event.body.id)).not.toContain(
      blockedParserSpanId,
    );
    expect(rootSpanId).toBe(traceId);
    expect(snapshots).toHaveLength(2);

    const rootSnapshot = snapshots.find(
      (snapshot) => snapshot.spanId === traceId,
    );
    const generationSnapshot = snapshots.find(
      (snapshot) => snapshot.spanId === generationId,
    );

    expect(rootSnapshot).toMatchObject({
      spanId: traceId,
      traceId,
      type: "SPAN",
      name: "dataset-run-item-008e4",
      environment: LangfuseInternalTraceEnvironment.PromptExperiments,
      input: [
        { content: "You are a euro capital guesser.", role: "system" },
        { content: "What is the capital of Germany?", role: "user" },
      ],
      output: "The capital of Germany is Berlin.",
      metadata: {
        dataset_id: "cml1yj2ag0001xsej1fcv6vz8",
        dataset_item_id: "f0c467a1-539b-4e25-b41b-8db3ae399ef4",
        experiment_name: "Prompt Capital guesser-v1 on dataset countries",
        experiment_run_name:
          "Prompt Capital guesser-v1 on dataset countries - 2026-01-31T06:57:38.646Z",
      },
      endTimeISO: "2026-01-31T06:58:03.709Z",
    });

    expect(generationSnapshot).toMatchObject({
      spanId: generationId,
      traceId,
      parentSpanId: traceId,
      type: "GENERATION",
      name: "ChatOpenAI",
      promptName: "Capital guesser",
      promptVersion: "1",
      modelName: "gpt-4.1-2025-04-14",
    });
  });

  it("should build trace-rooted event inputs with experiment metadata", async () => {
    const { rootSpanId, eventInputs } = buildInternalTraceEventInputs({
      processedEvents: getProcessedExperimentEvents(),
      traceId,
      projectId: "project-123",
      experimentContext: getExperimentContext(),
    });

    // Direct write uses original IDs (no t- prefix remapping).
    // The experiment backfill job skips traces already in events_core via LEFT ANTI JOIN.
    expect(rootSpanId).toBe(traceId);
    expect(eventInputs).toHaveLength(2);

    const rootEventInput = eventInputs.find(
      (eventInput) => eventInput.spanId === traceId,
    );
    const generationEventInput = eventInputs.find(
      (eventInput) => eventInput.spanId === generationId,
    );

    expect(rootEventInput).toMatchObject({
      projectId: "project-123",
      traceId,
      spanId: traceId,
      parentSpanId: undefined,
      type: "SPAN",
      experimentId: "run-456",
      experimentName:
        "Prompt Capital guesser-v1 on dataset countries - 2026-01-31T06:57:38.646Z",
      experimentItemRootSpanId: traceId,
      input: JSON.stringify([
        { content: "You are a euro capital guesser.", role: "system" },
        { content: "What is the capital of Germany?", role: "user" },
      ]),
      output: "The capital of Germany is Berlin.",
      source: "ingestion-api-dual-write-experiments",
    });

    expect(generationEventInput).toMatchObject({
      traceId,
      spanId: generationId,
      parentSpanId: traceId,
      type: "GENERATION",
      promptName: "Capital guesser",
      promptVersion: "1",
      modelName: "gpt-4.1-2025-04-14",
    });

    const rootEventRecord = await ingestionService.createEventRecord(
      rootEventInput!,
      "",
    );
    const rootObservation =
      convertEventRecordToObservationForEval(rootEventRecord);

    expect(rootObservation.span_id).toBe(traceId);
    expect(rootObservation.experiment_item_root_span_id).toBe(traceId);
    expect(rootObservation.type).toBe("SPAN");
    expect(rootObservation.name).toBe("dataset-run-item-008e4");
    expect(rootObservation.experiment_id).toBe("run-456");
    expect(rootObservation.experiment_name).toBe(
      "Prompt Capital guesser-v1 on dataset countries - 2026-01-31T06:57:38.646Z",
    );
    expect(rootObservation.experiment_item_expected_output).toBe(
      JSON.stringify({ capital: "Berlin" }),
    );
  });

  it("should build non-experiment internal traces without experiment columns", () => {
    const { eventInputs } = buildInternalTraceEventInputs({
      processedEvents: getProcessedExperimentEvents(),
      traceId,
      projectId: "project-123",
    });

    const rootEventInput = eventInputs.find(
      (eventInput) => eventInput.spanId === traceId,
    );

    expect(rootEventInput).toMatchObject({
      spanId: traceId,
      source: "ingestion-api-dual-write",
      experimentId: undefined,
      experimentItemRootSpanId: undefined,
    });
  });
});

describe("scheduleExperimentObservationEvals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchObservationEvalConfigs.mockResolvedValue([{ id: "config-1" }]);
    mockCreateObservationEvalSchedulerDeps.mockReturnValue({
      uploadObservationToS3: vi.fn(),
      upsertJobExecution: vi.fn(),
      enqueueEvalJob: vi.fn(),
    });
    mockScheduleObservationEvals.mockResolvedValue(undefined);
  });

  it("should schedule evals against the trace-root observation", async () => {
    const { eventInputs } = buildInternalTraceEventInputs({
      processedEvents: getProcessedExperimentEvents(),
      traceId,
      projectId: "project-123",
      experimentContext: getExperimentContext(),
    });
    const rootEventInput = eventInputs.find(
      (eventInput) => eventInput.spanId === traceId,
    );
    const rootEventRecord = await ingestionService.createEventRecord(
      rootEventInput!,
      "",
    );
    const observation = convertEventRecordToObservationForEval(rootEventRecord);

    await scheduleExperimentObservationEvals({ observation });

    expect(mockFetchObservationEvalConfigs).toHaveBeenCalledWith("project-123");
    expect(mockScheduleObservationEvals).toHaveBeenCalledWith({
      observation,
      configs: [{ id: "config-1" }],
      schedulerDeps: expect.any(Object),
    });
    expect(observation.span_id).toBe(traceId);
    expect(observation.experiment_item_root_span_id).toBe(traceId);
  });

  it("should skip scheduling when no configs exist", async () => {
    mockFetchObservationEvalConfigs.mockResolvedValue([]);

    const observation = {
      span_id: traceId,
      trace_id: traceId,
      project_id: "project-123",
      type: "SPAN",
      name: "dataset-run-item-008e4",
      environment: LangfuseInternalTraceEnvironment.PromptExperiments,
      level: "DEFAULT",
      experiment_item_root_span_id: traceId,
      tags: [],
      provided_usage_details: {},
      provided_cost_details: {},
      usage_details: {},
      cost_details: {},
      tool_definitions: {},
      tool_calls: [],
      tool_call_names: [],
    } as ObservationForEval;

    await scheduleExperimentObservationEvals({ observation });

    expect(mockScheduleObservationEvals).not.toHaveBeenCalled();
  });
});
