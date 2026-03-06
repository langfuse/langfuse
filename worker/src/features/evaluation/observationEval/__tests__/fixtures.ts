import { vi } from "vitest";
import { randomUUID } from "crypto";
import { type Prisma } from "@langfuse/shared/src/db";
import { type ObservationForEval, EvalTargetObject } from "@langfuse/shared";
import {
  type ObservationEvalConfig,
  type ObservationEvalSchedulerDeps,
} from "../types";
import { type ObservationEvalProcessorDeps } from "../observationEvalProcessor";
import {
  type EvalExecutionDeps,
  createMockEvalExecutionDeps,
} from "../../evalExecutionDeps";

/**
 * Creates a test ObservationForEval with sensible defaults.
 * All fields can be overridden.
 * Note: Uses snake_case field names matching eventRecordBaseSchema.
 */
export function createTestObservation(
  overrides: Partial<ObservationForEval> = {},
): ObservationForEval {
  return {
    // Core identifiers
    span_id: `obs-${randomUUID()}`,
    trace_id: `trace-${randomUUID()}`,
    project_id: "test-project-123",
    parent_span_id: null,

    // Observation properties
    type: "GENERATION",
    name: "test-observation",
    environment: "test",
    level: "DEFAULT",
    status_message: null,
    version: "v1.0",

    // Trace-level properties
    trace_name: "test-trace",
    user_id: "user-123",
    session_id: "session-456",
    tags: ["test-tag"],
    release: "v1.0.0",

    // Model properties
    provided_model_name: "gpt-4",
    model_parameters: '{"temperature": 0.7}',

    // Prompt properties
    prompt_id: null,
    prompt_name: null,
    prompt_version: null,

    // Tool call properties
    tool_definitions: {},
    tool_calls: [],
    tool_call_names: [],

    // Usage & Cost
    usage_details: { input: 100, output: 50 },
    cost_details: {},
    provided_usage_details: {},
    provided_cost_details: {},

    // Experiment properties
    experiment_id: null,
    experiment_name: null,
    experiment_description: null,
    experiment_dataset_id: null,
    experiment_item_id: null,
    experiment_item_expected_output: null,
    experiment_item_root_span_id: null,

    // Data fields
    input: '{"prompt": "Hello, how are you?"}',
    output: '{"response": "I am fine, thank you!"}',
    metadata: { key: "value" },

    ...overrides,
  };
}

/**
 * Creates a test ObservationEvalConfig with sensible defaults.
 */
export function createTestEvalConfig(
  overrides: Partial<ObservationEvalConfig> = {},
): ObservationEvalConfig {
  return {
    id: `config-${randomUUID()}`,
    projectId: "test-project-123",
    filter: [],
    sampling: { toNumber: () => 1 } as unknown as Prisma.Decimal,
    evalTemplateId: `template-${randomUUID()}`,
    scoreName: "test-score",
    targetObject: EvalTargetObject.EVENT,
    variableMapping: [
      { templateVariable: "output", selectedColumnId: "output" },
    ],
    ...overrides,
  };
}

/**
 * Creates mock scheduler dependencies with vi.fn() for all methods.
 * Returns both the deps and the mock functions for assertions.
 */
export function createMockSchedulerDeps(
  overrides: Partial<{
    createJobExecution: ReturnType<typeof vi.fn>;
    uploadObservationToS3: ReturnType<typeof vi.fn>;
    enqueueEvalJob: ReturnType<typeof vi.fn>;
  }> = {},
): ObservationEvalSchedulerDeps {
  return {
    upsertJobExecution:
      overrides.createJobExecution ??
      vi.fn().mockResolvedValue({ id: `job-exec-${randomUUID()}` }),
    uploadObservationToS3:
      overrides.uploadObservationToS3 ??
      vi.fn().mockResolvedValue(`observations/test/obs-123.json`),
    enqueueEvalJob:
      overrides.enqueueEvalJob ?? vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates mock processor dependencies for observationEvalProcessor.
 */
export function createMockProcessorDeps(
  overrides: Partial<{
    downloadObservationFromS3: ReturnType<typeof vi.fn>;
  }> = {},
): ObservationEvalProcessorDeps {
  const defaultObservation = createTestObservation();

  return {
    downloadObservationFromS3:
      overrides.downloadObservationFromS3 ??
      vi.fn().mockResolvedValue(JSON.stringify(defaultObservation)),
  };
}

/**
 * Creates a mock job execution record.
 */
export function createMockJobExecution(
  overrides: Partial<{
    id: string;
    projectId: string;
    status: string;
    jobConfigurationId: string;
    jobInputTraceId: string | null;
    jobInputObservationId: string | null;
    jobInputDatasetItemId: string | null;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
    startTime: Date | null;
    endTime: Date | null;
    jobOutputScoreId: string | null;
    executionTraceId: string | null;
    jobTemplateId: string | null;
    jobInputTraceTimestamp: Date | null;
  }> = {},
) {
  return {
    id: overrides.id ?? `job-exec-${randomUUID()}`,
    projectId: overrides.projectId ?? "test-project-123",
    status: overrides.status ?? "PENDING",
    jobConfigurationId:
      overrides.jobConfigurationId ?? `config-${randomUUID()}`,
    jobInputTraceId: overrides.jobInputTraceId ?? `trace-${randomUUID()}`,
    jobInputObservationId:
      overrides.jobInputObservationId ?? `obs-${randomUUID()}`,
    jobInputDatasetItemId: overrides.jobInputDatasetItemId ?? null,
    error: overrides.error ?? null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    startTime: overrides.startTime ?? new Date(),
    endTime: overrides.endTime ?? null,
    jobOutputScoreId: overrides.jobOutputScoreId ?? null,
    executionTraceId: overrides.executionTraceId ?? null,
    jobTemplateId: overrides.jobTemplateId ?? null,
    jobInputTraceTimestamp: overrides.jobInputTraceTimestamp ?? null,
  };
}

/**
 * Creates a mock job configuration record.
 * Use evalTemplate option to include a nested template (for Prisma include queries).
 */
export function createMockJobConfiguration(
  overrides: Partial<{
    id: string;
    projectId: string;
    jobType: string;
    evalTemplateId: string | null;
    scoreName: string;
    targetObject: string;
    filter: unknown[];
    variableMapping: unknown[];
    sampling: string;
    delay: number;
    status: string;
    timeScope: string[];
    createdAt: Date;
    updatedAt: Date;
    evalTemplate: ReturnType<typeof createMockEvalTemplate> | null;
  }> = {},
) {
  const templateId = overrides.evalTemplateId ?? `template-${randomUUID()}`;
  const projectId = overrides.projectId ?? "test-project-123";

  return {
    id: overrides.id ?? `config-${randomUUID()}`,
    projectId,
    jobType: overrides.jobType ?? "EVAL",
    evalTemplateId: templateId,
    scoreName: overrides.scoreName ?? "test-score",
    targetObject: overrides.targetObject ?? EvalTargetObject.EVENT,
    filter: overrides.filter ?? [],
    variableMapping: overrides.variableMapping ?? [
      { templateVariable: "output", selectedColumnId: "output" },
    ],
    sampling: overrides.sampling ?? "1.0",
    delay: overrides.delay ?? 0,
    status: overrides.status ?? "ACTIVE",
    timeScope: overrides.timeScope ?? ["NEW"],
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
    // Include evalTemplate when provided, or create default one
    evalTemplate:
      overrides.evalTemplate !== undefined
        ? overrides.evalTemplate
        : createMockEvalTemplate({ id: templateId, projectId }),
  };
}

/**
 * Creates a mock eval template record.
 */
export function createMockEvalTemplate(
  overrides: Partial<{
    id: string;
    projectId: string | null;
    name: string;
    version: number;
    prompt: string;
    model: string;
    provider: string;
    modelParams: Record<string, unknown>;
    outputSchema: Record<string, string>;
    vars: string[];
    createdAt: Date;
    updatedAt: Date;
  }> = {},
) {
  return {
    id: overrides.id ?? `template-${randomUUID()}`,
    projectId: overrides.projectId ?? "test-project-123",
    name: overrides.name ?? "Test Evaluator",
    version: overrides.version ?? 1,
    prompt:
      overrides.prompt ??
      "Evaluate the following output: {{output}}. Score 0-1.",
    model: overrides.model ?? "gpt-4",
    provider: overrides.provider ?? "openai",
    modelParams: overrides.modelParams ?? {},
    outputSchema: overrides.outputSchema ?? {
      score: "A number between 0 and 1",
      reasoning: "Explain your reasoning",
    },
    vars: overrides.vars ?? ["output"],
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

/**
 * Creates a fully mocked eval pipeline that connects scheduler → processor → execution.
 * Useful for E2E-style tests where you want to trace data through the full flow.
 */
export function createFullyMockedEvalPipeline(
  config: {
    llmResponse?: { score: number; reasoning: string };
    s3UploadPath?: string;
    observation?: ObservationForEval;
  } = {},
) {
  const uploadedData = new Map<string, unknown>();
  const observation = config.observation ?? createTestObservation();

  const schedulerDeps: ObservationEvalSchedulerDeps = {
    upsertJobExecution: vi
      .fn()
      .mockResolvedValue({ id: `job-exec-${randomUUID()}` }),
    uploadObservationToS3: vi.fn().mockImplementation(async (params) => {
      const path =
        config.s3UploadPath ??
        `evals/${params.projectId}/observations/${params.observationId}.json`;
      uploadedData.set(path, params.data);
      return path;
    }),
    enqueueEvalJob: vi.fn().mockResolvedValue(undefined),
  };

  const processorDeps: ObservationEvalProcessorDeps = {
    downloadObservationFromS3: vi.fn().mockImplementation(async (path) => {
      const data = uploadedData.get(path);
      if (data) {
        return JSON.stringify(data);
      }
      return JSON.stringify(observation);
    }),
  };

  const executionDeps: EvalExecutionDeps = createMockEvalExecutionDeps({
    callLLM: vi
      .fn()
      .mockResolvedValue(
        config.llmResponse ?? { score: 0.85, reasoning: "Good response" },
      ),
    fetchModelConfig: vi.fn().mockResolvedValue({
      valid: true,
      config: {
        provider: "openai",
        model: "gpt-4",
        apiKey: { adapter: "openai", secretKey: "test-key" },
        modelParams: {},
      },
    }),
    uploadScore: vi.fn().mockResolvedValue(undefined),
    enqueueScoreIngestion: vi.fn().mockResolvedValue(undefined),
    updateJobExecution: vi.fn().mockResolvedValue(undefined),
  });

  return {
    schedulerDeps,
    processorDeps,
    executionDeps,
    observation,
    getUploadedData: () => uploadedData,
  };
}
