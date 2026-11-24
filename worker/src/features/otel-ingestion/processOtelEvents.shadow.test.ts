import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../env";
import { processOtelEvents } from "./processOtelEvents";
import { hashOtelObservation, type OtelEffect } from "./otelEffectsCapture";
import { fetchEvalRules } from "../evaluation/fetchEvalRules";
import {
  createEvalSchedulerDeps,
  scheduleEvals,
  type EvalSchedulerDeps,
} from "../evaluation/scheduleEvals";

vi.mock("../evaluation/fetchEvalRules", () => ({
  fetchEvalRules: vi.fn(),
}));

vi.mock("../evaluation/scheduleEvals", () => ({
  createEvalSchedulerDeps: vi.fn(),
  scheduleEvals: vi.fn(),
}));

vi.mock("../eventsDispatch/config", () => ({
  isEventsDispatchEnabled: vi.fn(() => true),
}));

vi.mock("../traceDispatch/traceDispatchSampling", () => ({
  isTraceDispatchSampled: vi.fn(() => true),
  resolveTraceDispatchSamplingRate: vi.fn().mockResolvedValue(0.25),
}));

describe("processOtelEvents shadow capture", () => {
  const originalEnv = {
    NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION,
    LANGFUSE_EVENTS_DISPATCH_ENABLED: env.LANGFUSE_EVENTS_DISPATCH_ENABLED,
    LANGFUSE_EVENTS_DISPATCH_SAMPLING_RATE_EXPERIMENTAL:
      env.LANGFUSE_EVENTS_DISPATCH_SAMPLING_RATE_EXPERIMENTAL,
    LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED: env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED,
  };

  const eventInput = {
    projectId: "project",
    traceId: "trace",
    spanId: "span",
    startTimeISO: "2026-11-19T10:00:00.000Z",
    environment: "production",
  };

  const observation = {
    z: 1,
    nested: { b: true, a: "value" },
    array: ["first", "second"],
  };

  let schedulerDeps: EvalSchedulerDeps;

  beforeEach(() => {
    env.NEXT_PUBLIC_LANGFUSE_CLOUD_REGION = "DEV";
    env.LANGFUSE_EVENTS_DISPATCH_ENABLED = "true";
    env.LANGFUSE_EVENTS_DISPATCH_SAMPLING_RATE_EXPERIMENTAL = 0.25;
    env.LANGFUSE_OTEL_MEDIA_UPLOAD_ENABLED = "false";

    schedulerDeps = {
      upsertJobExecution: vi.fn().mockResolvedValue({ id: "job" }),
      uploadObservationToS3: vi.fn().mockResolvedValue("s3://primary"),
      enqueueEvalJob: vi.fn().mockResolvedValue(undefined),
      traceTranscriptRules: Promise.resolve([]),
      collectTraceActivity: vi.fn(),
      flushTraceActivity: vi.fn().mockResolvedValue(undefined),
    } as unknown as EvalSchedulerDeps;

    vi.mocked(fetchEvalRules).mockResolvedValue({
      observationRules: [{} as never],
      traceTranscriptRules: [],
    });
    vi.mocked(createEvalSchedulerDeps).mockReturnValue(schedulerDeps);
    vi.mocked(scheduleEvals).mockImplementation(
      async ({ schedulerDeps: eventSchedulerDeps }) => {
        await eventSchedulerDeps.upsertJobExecution({
          id: "job",
          projectId: "project",
          jobConfigurationId: "config",
          jobInputTraceId: "trace",
          jobInputObservationId: "span",
          jobTemplateId: null,
          status: "PENDING",
        } as never);
        await eventSchedulerDeps.uploadObservationToS3({
          projectId: "project",
          traceId: "trace",
          observationId: "span",
          data: observation,
        } as never);
        await eventSchedulerDeps.enqueueEvalJob({
          jobExecutionId: "job",
          projectId: "project",
          observationS3Path: "s3://primary",
          delay: 0,
          evalTemplateType: "LLM",
        } as never);
        return ["rule"];
      },
    );
  });

  afterEach(() => {
    Object.assign(env, originalEnv);
    vi.clearAllMocks();
  });

  function createIngestionService() {
    return {
      createEventRecord: vi.fn().mockResolvedValue({
        project_id: "project",
        trace_id: "trace",
        span_id: "span",
        environment: "production",
      }),
      writeEventRecord: vi.fn().mockResolvedValue({ event_bytes: 123 }),
    };
  }

  function runProcess(
    shadowCapture?: { capture: (effect: OtelEffect) => void },
    ingestionService = createIngestionService(),
  ) {
    return processOtelEvents({
      processor: {
        processToEvent: () => [eventInput],
      } as never,
      resourceSpans: [],
      ingestionService: ingestionService as never,
      projectId: "project",
      fileKey: "file.json",
      shouldWriteToEventsTable: true,
      ...(shadowCapture ? { shadowCapture } : {}),
    });
  }

  it("captures scheduler inputs and actual eval/trace intents without the observation body", async () => {
    const effects: OtelEffect[] = [];

    await runProcess({ capture: (effect) => effects.push(effect) });

    expect(effects.map(({ kind }) => kind)).toEqual([
      "scheduling-context",
      "eval-upsert",
      "eval-blob-upload",
      "observation-eval",
      "trace-recording",
    ]);
    const scheduling = effects[0];
    expect(scheduling).toMatchObject({
      kind: "scheduling-context",
      projectId: "project",
      traceDispatchSamplingRate: 0.25,
    });
    expect(
      await (scheduling as Extract<OtelEffect, { kind: "scheduling-context" }>)
        .traceTranscriptRules,
    ).toEqual([]);

    const evaluation = effects[3];
    expect(evaluation).toMatchObject({
      kind: "observation-eval",
      observationHash: hashOtelObservation(observation),
      jobExecutionId: "job",
    });
    expect(evaluation).not.toHaveProperty("data");
    expect(evaluation).not.toHaveProperty("observation");
  });

  it("does not hash an eval observation when primary capture is absent", async () => {
    const hash = vi.spyOn(
      await import("./otelEffectsCapture"),
      "hashOtelObservation",
    );

    await runProcess();

    expect(hash).not.toHaveBeenCalled();
    hash.mockRestore();
  });

  it("keeps primary eval upload and enqueue outcomes when capture hashing fails", async () => {
    const effects: OtelEffect[] = [];
    const hash = vi.spyOn(
      await import("./otelEffectsCapture"),
      "hashOtelObservation",
    );
    hash.mockImplementation(() => {
      throw new RangeError("capture recursion");
    });

    try {
      await runProcess({ capture: (effect) => effects.push(effect) });

      expect(schedulerDeps.uploadObservationToS3).toHaveBeenCalledOnce();
      expect(schedulerDeps.enqueueEvalJob).toHaveBeenCalledOnce();
      expect(effects.map(({ kind }) => kind)).toEqual([
        "scheduling-context",
        "eval-upsert",
        "capture-failure",
        "trace-recording",
      ]);
      expect(effects[2]).toEqual({
        kind: "capture-failure",
        stage: "observation-hash",
        mode: "actual",
        error: { type: "RangeError" },
      });
    } finally {
      hash.mockRestore();
    }
  });

  it("does not report an eval intent when the real enqueue fails", async () => {
    const effects: OtelEffect[] = [];
    schedulerDeps.enqueueEvalJob = vi
      .fn()
      .mockRejectedValue(new Error("queue unavailable"));
    vi.mocked(scheduleEvals).mockImplementation(
      async ({ schedulerDeps: eventSchedulerDeps }) => {
        try {
          await eventSchedulerDeps.upsertJobExecution({
            id: "job",
            projectId: "project",
            jobConfigurationId: "config",
            jobInputTraceId: "trace",
            jobInputObservationId: "span",
            jobTemplateId: null,
            status: "PENDING",
          } as never);
          const observationS3Path =
            await eventSchedulerDeps.uploadObservationToS3({
              projectId: "project",
              traceId: "trace",
              observationId: "span",
              data: observation,
            } as never);
          await eventSchedulerDeps.enqueueEvalJob({
            jobExecutionId: "job",
            projectId: "project",
            observationS3Path,
            delay: 0,
            evalTemplateType: "LLM",
          } as never);
          return ["rule"];
        } catch {
          // Mirrors scheduleEvals swallowing a per-row assignment failure.
          return undefined;
        }
      },
    );

    await runProcess({ capture: (effect) => effects.push(effect) });

    expect(effects).toContainEqual({
      kind: "operation-failure",
      operation: "eval-enqueue",
      mode: "actual",
      projectId: "project",
      traceId: "trace",
      observationId: "span",
      error: { type: "Error" },
    });
    expect(effects).toContainEqual({
      kind: "eval-upsert",
      projectId: "project",
      jobExecutionId: "job",
      jobConfigurationId: "config",
    });
    expect(effects).toContainEqual({
      kind: "eval-blob-upload",
      projectId: "project",
      traceId: "trace",
      observationId: "span",
      observationHash: hashOtelObservation(observation),
    });
    expect(effects.some((effect) => effect.kind === "observation-eval")).toBe(
      false,
    );
  });

  it("marks a swallowed direct row creation failure as incomplete", async () => {
    const effects: OtelEffect[] = [];
    const ingestionService = createIngestionService();
    ingestionService.createEventRecord.mockRejectedValue(
      new Error("row construction failed"),
    );

    await processOtelEvents({
      processor: {
        processToEvent: () => [eventInput],
      } as never,
      resourceSpans: [],
      ingestionService: ingestionService as never,
      projectId: "project",
      fileKey: "file.json",
      shouldWriteToEventsTable: true,
      shadowCapture: { capture: (effect) => effects.push(effect) },
    });

    expect(effects).toContainEqual({
      kind: "operation-failure",
      operation: "direct-row-create",
      mode: "actual",
      projectId: "project",
      traceId: "trace",
      observationId: "span",
      error: { type: "Error" },
    });
  });
});
