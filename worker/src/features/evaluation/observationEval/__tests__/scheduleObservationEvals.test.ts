import { describe, it, expect, vi, beforeEach } from "vitest";
import { scheduleObservationEvals } from "../scheduleObservationEvals";
import {
  type ObservationForEval,
  type ObservationEvalConfig,
  type ObservationEvalSchedulerDeps,
} from "../types";
import { type Prisma } from "@langfuse/shared/src/db";
import { EvalTargetObject, JobExecutionStatus } from "@langfuse/shared";
import { createW3CTraceId } from "../../../utils";

describe("scheduleObservationEvals", () => {
  const createMockObservation = (
    overrides: Partial<ObservationForEval> = {},
  ): ObservationForEval => ({
    // Core identifiers (snake_case)
    span_id: "obs-123",
    trace_id: "trace-456",
    project_id: "project-789",
    parent_span_id: null,

    // Observation properties
    type: "GENERATION",
    name: "chat-completion",
    environment: "production",
    level: "DEFAULT",
    status_message: null,
    version: "v1.0",

    // Trace-level properties
    trace_name: "my-trace",
    user_id: "user-abc",
    session_id: "session-xyz",
    tags: ["tag1", "tag2"],
    release: "v2.0.0",

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

    // Data fields
    input: '{"prompt": "Hello"}',
    output: '{"response": "World"}',
    metadata: { key1: "value1" },
    ...overrides,
  });

  const createMockConfig = (
    overrides: Partial<ObservationEvalConfig> = {},
  ): ObservationEvalConfig => ({
    id: "config-1",
    projectId: "project-789",
    filter: [],
    sampling: { toNumber: () => 1 } as unknown as Prisma.Decimal,
    evalTemplateId: "template-1",
    scoreName: "quality",
    variableMapping: [],
    targetObject: EvalTargetObject.EVENT,
    delay: 0,
    ...overrides,
  });

  const createMockSchedulerDeps = (): ObservationEvalSchedulerDeps => ({
    upsertJobExecution: vi.fn().mockResolvedValue({ id: "job-exec-1" }),
    uploadObservationToS3: vi
      .fn()
      .mockResolvedValue("observations/project-789/obs-123.json"),
    enqueueEvalJob: vi.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("empty configs", () => {
    it("should return early when configs array is empty", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation();

      await scheduleObservationEvals({
        observation,
        configs: [],
        schedulerDeps,
      });

      expect(schedulerDeps.uploadObservationToS3).not.toHaveBeenCalled();
      expect(schedulerDeps.upsertJobExecution).not.toHaveBeenCalled();
      expect(schedulerDeps.enqueueEvalJob).not.toHaveBeenCalled();
    });
  });

  describe("S3 upload", () => {
    it("should upload observation to S3 once when configs exist", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation();

      await scheduleObservationEvals({
        observation,
        configs: [createMockConfig({ id: "config-1" })],
        schedulerDeps,
      });

      expect(schedulerDeps.uploadObservationToS3).toHaveBeenCalledTimes(1);
      expect(schedulerDeps.uploadObservationToS3).toHaveBeenCalledWith({
        projectId: "project-789",
        observationId: "obs-123",
        data: observation,
      });
    });

    it("should upload only once even with multiple configs", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation();

      await scheduleObservationEvals({
        observation,
        configs: [
          createMockConfig({ id: "config-1" }),
          createMockConfig({ id: "config-2" }),
          createMockConfig({ id: "config-3" }),
        ],
        schedulerDeps,
      });

      expect(schedulerDeps.uploadObservationToS3).toHaveBeenCalledTimes(1);
    });
  });

  describe("filter evaluation", () => {
    it("should skip config and S3 upload when filter does not match", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation({ type: "span" });

      await scheduleObservationEvals({
        observation,
        configs: [
          createMockConfig({
            filter: [
              {
                column: "type",
                type: "stringOptions",
                operator: "any of",
                value: ["generation"],
              },
            ],
          }),
        ],
        schedulerDeps,
      });

      expect(schedulerDeps.uploadObservationToS3).not.toHaveBeenCalled();
      expect(schedulerDeps.upsertJobExecution).not.toHaveBeenCalled();
      expect(schedulerDeps.enqueueEvalJob).not.toHaveBeenCalled();
    });

    it("should process config when filter matches", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation({ type: "generation" });

      await scheduleObservationEvals({
        observation,
        configs: [
          createMockConfig({
            filter: [
              {
                column: "type",
                type: "stringOptions",
                operator: "any of",
                value: ["generation"],
              },
            ],
          }),
        ],
        schedulerDeps,
      });

      expect(schedulerDeps.upsertJobExecution).toHaveBeenCalled();
      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalled();
    });

    it("should process config when filter is empty (matches all)", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation();

      await scheduleObservationEvals({
        observation,
        configs: [createMockConfig({ filter: [] })],
        schedulerDeps,
      });

      expect(schedulerDeps.upsertJobExecution).toHaveBeenCalled();
      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalled();
    });

    it("should process config when targeting is ignored even if filter does not match", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation({ type: "span" });

      await scheduleObservationEvals({
        observation,
        configs: [
          createMockConfig({
            filter: [
              {
                column: "type",
                type: "stringOptions",
                operator: "any of",
                value: ["generation"],
              },
            ],
          }),
        ],
        schedulerDeps,
        ignoreConfigTargeting: true,
      });

      expect(schedulerDeps.upsertJobExecution).toHaveBeenCalledTimes(1);
      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalledTimes(1);
      expect(schedulerDeps.uploadObservationToS3).toHaveBeenCalledTimes(1);
    });
  });

  describe("sampling", () => {
    it("should skip config and S3 upload when sampled out (sampling rate 0)", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation();

      await scheduleObservationEvals({
        observation,
        configs: [
          createMockConfig({
            sampling: { toNumber: () => 0 } as unknown as Prisma.Decimal,
          }),
        ],
        schedulerDeps,
      });

      expect(schedulerDeps.uploadObservationToS3).not.toHaveBeenCalled();
      expect(schedulerDeps.upsertJobExecution).not.toHaveBeenCalled();
      expect(schedulerDeps.enqueueEvalJob).not.toHaveBeenCalled();
    });

    it("should process config when sampling rate is 1 (always sample)", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation();

      await scheduleObservationEvals({
        observation,
        configs: [
          createMockConfig({
            sampling: { toNumber: () => 1 } as unknown as Prisma.Decimal,
          }),
        ],
        schedulerDeps,
      });

      expect(schedulerDeps.upsertJobExecution).toHaveBeenCalled();
      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalled();
    });

    it("should process config when targeting is ignored even if sampled out", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation();

      await scheduleObservationEvals({
        observation,
        configs: [
          createMockConfig({
            sampling: { toNumber: () => 0 } as unknown as Prisma.Decimal,
          }),
        ],
        schedulerDeps,
        ignoreConfigTargeting: true,
      });

      expect(schedulerDeps.upsertJobExecution).toHaveBeenCalledTimes(1);
      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalledTimes(1);
      expect(schedulerDeps.uploadObservationToS3).toHaveBeenCalledTimes(1);
    });
  });

  describe("job creation and enqueuing", () => {
    it("should create job execution with correct data", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation();
      const config = createMockConfig();

      await scheduleObservationEvals({
        observation,
        configs: [config],
        schedulerDeps,
      });

      const expectedJobExecutionId = createW3CTraceId(
        `${config.id}:${observation.span_id}`,
      );
      expect(schedulerDeps.upsertJobExecution).toHaveBeenCalledWith({
        id: expectedJobExecutionId,
        projectId: "project-789",
        jobConfigurationId: "config-1",
        jobInputTraceId: "trace-456",
        jobInputObservationId: "obs-123",
        jobTemplateId: config.evalTemplateId,
        status: JobExecutionStatus.PENDING,
      });
    });

    it("should enqueue job with correct parameters", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      schedulerDeps.uploadObservationToS3 = vi
        .fn()
        .mockResolvedValue("observations/project-789/obs-123.json");
      const observation = createMockObservation();
      const config = createMockConfig();

      await scheduleObservationEvals({
        observation,
        configs: [config],
        schedulerDeps,
      });

      const expectedJobExecutionId = createW3CTraceId(
        `${config.id}:${observation.span_id}`,
      );
      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalledWith({
        jobExecutionId: expectedJobExecutionId,
        projectId: "project-789",
        observationS3Path: "observations/project-789/obs-123.json",
        delay: 0,
      });
    });
  });

  describe("multiple configs", () => {
    it("should process multiple matching configs independently", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      schedulerDeps.upsertJobExecution = vi
        .fn()
        .mockResolvedValueOnce({ id: "job-exec-1" })
        .mockResolvedValueOnce({ id: "job-exec-2" })
        .mockResolvedValueOnce({ id: "job-exec-3" });
      const observation = createMockObservation();

      await scheduleObservationEvals({
        observation,
        configs: [
          createMockConfig({ id: "config-1" }),
          createMockConfig({ id: "config-2" }),
          createMockConfig({ id: "config-3" }),
        ],
        schedulerDeps,
      });

      // S3 upload only once
      expect(schedulerDeps.uploadObservationToS3).toHaveBeenCalledTimes(1);

      // Job creation for each config
      expect(schedulerDeps.upsertJobExecution).toHaveBeenCalledTimes(3);
      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalledTimes(3);
    });

    it("should skip only non-matching configs", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation({ type: "generation" });

      await scheduleObservationEvals({
        observation,
        configs: [
          createMockConfig({
            id: "config-1",
            filter: [
              {
                column: "type",
                type: "stringOptions",
                operator: "any of",
                value: ["generation"],
              },
            ],
          }),
          createMockConfig({
            id: "config-2",
            filter: [
              {
                column: "type",
                type: "stringOptions",
                operator: "any of",
                value: ["span"],
              },
            ],
          }),
          createMockConfig({
            id: "config-3",
            filter: [],
          }),
        ],
        schedulerDeps,
      });

      // Should create jobs for config-1 and config-3, but not config-2
      expect(schedulerDeps.upsertJobExecution).toHaveBeenCalledTimes(2);
      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalledTimes(2);
    });
  });
});
