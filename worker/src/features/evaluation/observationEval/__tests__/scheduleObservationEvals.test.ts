import { describe, it, expect, vi, beforeEach } from "vitest";
import { scheduleObservationEvals } from "../scheduleObservationEvals";
import {
  type ObservationForEval,
  type ObservationEvalConfig,
  type ObservationEvalSchedulerDeps,
} from "../types";
import { type Prisma } from "@langfuse/shared/src/db";

describe("scheduleObservationEvals", () => {
  const createMockObservation = (
    overrides: Partial<ObservationForEval> = {},
  ): ObservationForEval => ({
    // Core identifiers
    id: "obs-123",
    traceId: "trace-456",
    projectId: "project-789",
    parentObservationId: null,

    // Observation properties
    type: "generation",
    name: "chat-completion",
    environment: "production",
    level: "DEFAULT",
    statusMessage: null,
    version: "v1.0",

    // Trace-level properties
    traceName: "my-trace",
    userId: "user-abc",
    sessionId: "session-xyz",
    tags: ["tag1", "tag2"],
    release: "v2.0.0",

    // Model properties
    model: "gpt-4",
    modelParameters: '{"temperature": 0.7}',

    // Prompt properties
    promptId: null,
    promptName: null,
    promptVersion: null,

    // Tool call properties
    toolDefinitions: {},
    toolCalls: [],
    toolCallNames: [],

    // Usage & Cost
    usageDetails: { input: 100, output: 50 },
    costDetails: {},
    providedUsageDetails: {},
    providedCostDetails: {},

    // Experiment properties
    experimentId: null,
    experimentName: null,
    experimentDescription: null,
    experimentDatasetId: null,
    experimentItemId: null,
    experimentItemExpectedOutput: null,

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
    targetObject: "event",
    delay: 0,
    ...overrides,
  });

  const createMockSchedulerDeps = (): ObservationEvalSchedulerDeps => ({
    createJobExecution: vi.fn().mockResolvedValue({ id: "job-exec-1" }),
    findExistingJobExecution: vi.fn().mockResolvedValue(null),
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
      expect(schedulerDeps.createJobExecution).not.toHaveBeenCalled();
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
    it("should skip config when filter does not match", async () => {
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

      expect(schedulerDeps.createJobExecution).not.toHaveBeenCalled();
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

      expect(schedulerDeps.createJobExecution).toHaveBeenCalled();
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

      expect(schedulerDeps.createJobExecution).toHaveBeenCalled();
      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalled();
    });
  });

  describe("sampling", () => {
    it("should skip config when sampled out (sampling rate 0)", async () => {
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

      expect(schedulerDeps.createJobExecution).not.toHaveBeenCalled();
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

      expect(schedulerDeps.createJobExecution).toHaveBeenCalled();
      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalled();
    });
  });

  describe("deduplication", () => {
    it("should skip config when job already exists for observation", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      schedulerDeps.findExistingJobExecution = vi
        .fn()
        .mockResolvedValue({ id: "existing-job" });
      const observation = createMockObservation();

      await scheduleObservationEvals({
        observation,
        configs: [createMockConfig()],
        schedulerDeps,
      });

      expect(schedulerDeps.findExistingJobExecution).toHaveBeenCalledWith({
        projectId: "project-789",
        jobConfigurationId: "config-1",
        jobInputObservationId: "obs-123",
      });
      expect(schedulerDeps.createJobExecution).not.toHaveBeenCalled();
      expect(schedulerDeps.enqueueEvalJob).not.toHaveBeenCalled();
    });

    it("should create job when no existing job found", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      schedulerDeps.findExistingJobExecution = vi.fn().mockResolvedValue(null);
      const observation = createMockObservation();

      await scheduleObservationEvals({
        observation,
        configs: [createMockConfig()],
        schedulerDeps,
      });

      expect(schedulerDeps.createJobExecution).toHaveBeenCalled();
    });
  });

  describe("job creation and enqueuing", () => {
    it("should create job execution with correct data", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      const observation = createMockObservation();

      await scheduleObservationEvals({
        observation,
        configs: [createMockConfig()],
        schedulerDeps,
      });

      expect(schedulerDeps.createJobExecution).toHaveBeenCalledWith({
        projectId: "project-789",
        jobConfigurationId: "config-1",
        jobInputTraceId: "trace-456",
        jobInputObservationId: "obs-123",
        status: "PENDING",
      });
    });

    it("should enqueue job with correct parameters", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      schedulerDeps.createJobExecution = vi
        .fn()
        .mockResolvedValue({ id: "job-exec-1" });
      schedulerDeps.uploadObservationToS3 = vi
        .fn()
        .mockResolvedValue("observations/project-789/obs-123.json");
      const observation = createMockObservation();

      await scheduleObservationEvals({
        observation,
        configs: [createMockConfig({ delay: 5000 })],
        schedulerDeps,
      });

      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalledWith({
        jobExecutionId: "job-exec-1",
        projectId: "project-789",
        observationS3Path: "observations/project-789/obs-123.json",
        delay: 5000,
      });
    });
  });

  describe("multiple configs", () => {
    it("should process multiple matching configs independently", async () => {
      const schedulerDeps = createMockSchedulerDeps();
      schedulerDeps.createJobExecution = vi
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
      expect(schedulerDeps.createJobExecution).toHaveBeenCalledTimes(3);
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
      expect(schedulerDeps.createJobExecution).toHaveBeenCalledTimes(2);
      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalledTimes(2);
    });
  });
});
