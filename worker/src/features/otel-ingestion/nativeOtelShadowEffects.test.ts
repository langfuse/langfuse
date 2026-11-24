import { describe, expect, it, vi } from "vitest";
import { MediaAssociationOrigin } from "@langfuse/shared";
import { EvalTemplateType, JobExecutionStatus } from "@langfuse/shared/src/db";
import { TableName } from "../../services/ClickhouseWriter/types";
import { createNativeOtelShadowEffects } from "./nativeOtelShadowEffects";
import type {
  OtelEffect,
  OtelMediaUploadEffect,
  OtelShadowCapture,
} from "./otelEffectsCapture";
import { createOtelShadowCapture } from "./primaryOtelShadowCapture";

type TestMediaIdentity = Pick<
  OtelMediaUploadEffect,
  | "kind"
  | "projectId"
  | "traceId"
  | "observationId"
  | "field"
  | "contentType"
  | "sha256Hash"
  | "origin"
  | "writePath"
>;

const identity: TestMediaIdentity = {
  kind: "media",
  projectId: "project",
  traceId: "trace",
  observationId: "observation",
  field: "input",
  contentType: "image/png",
  sha256Hash: "digest",
  origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
  writePath: "direct",
};

function captureFor(effects: OtelEffect[]): OtelShadowCapture {
  return { capture: (effect) => effects.push(effect) };
}

function shadowInputs(capture: OtelShadowCapture) {
  return {
    capture,
    writer: { addToQueue: vi.fn() },
    replayUpload: vi.fn(),
    evalRules: { observationRules: [], traceTranscriptRules: [] },
    traceDispatchSamplingRate: 1,
    traceTranscriptRules: Promise.resolve([]),
  };
}

describe("native OTEL shadow effects", () => {
  it("consumes one replay result per upload occurrence, including failures", async () => {
    const effects: OtelEffect[] = [];
    const inputs = shadowInputs(captureFor(effects));
    inputs.replayUpload
      .mockReturnValueOnce({
        mediaId: "media-1",
        outcome: "uploaded",
        cacheHit: false,
      })
      .mockReturnValueOnce({
        outcome: "failed",
        error: { type: "TimeoutError" },
      });
    const shadow = createNativeOtelShadowEffects(inputs);

    const request = {
      kind: "media" as const,
      identity,
      byteLengthUpperBound: 10,
      loadBody: vi.fn(async () => Buffer.from("unused")),
    };
    await expect(shadow.uploadMedia(request)).resolves.toMatchObject({
      mediaId: "media-1",
    });
    await expect(shadow.uploadMedia(request)).rejects.toThrow(
      "replayed media upload failed",
    );

    expect(inputs.replayUpload).toHaveBeenCalledTimes(2);
    expect(inputs.replayUpload).toHaveBeenNthCalledWith(1, identity);
    expect(inputs.replayUpload).toHaveBeenNthCalledWith(2, identity);
    expect(request.loadBody).not.toHaveBeenCalled();
  });

  it("matches media by semantic identity across scanner and writer phases", async () => {
    const primary = createOtelShadowCapture();
    primary.capture({
      kind: "media",
      projectId: identity.projectId,
      traceId: identity.traceId,
      observationId: identity.observationId,
      field: identity.field,
      contentType: identity.contentType,
      sha256Hash: identity.sha256Hash,
      origin: identity.origin,
      writePath: "legacy",
      mediaPath: "reference",
      request: { byteLengthUpperBound: 10 },
      result: { mediaId: "media-1", outcome: "uploaded" },
    });

    const inputs = shadowInputs(captureFor([]));
    inputs.replayUpload.mockImplementation(primary.replayUpload);
    const shadow = createNativeOtelShadowEffects(inputs);

    await expect(
      shadow.uploadMedia({
        kind: "media",
        identity: { ...identity, writePath: "direct", mediaPath: "early" },
        byteLengthUpperBound: 10,
        loadBody: vi.fn(async () => Buffer.from("unused")),
      }),
    ).resolves.toMatchObject({ mediaId: "media-1" });
  });

  it("routes rows through only the supplied test writer", () => {
    const effects: OtelEffect[] = [];
    const inputs = shadowInputs(captureFor(effects));
    const shadow = createNativeOtelShadowEffects(inputs);
    const event = { ids: { id: "event" } } as never;

    shadow.writeEvent(event, "2026-11-19T00:00:00.000Z");

    expect(inputs.writer.addToQueue).toHaveBeenCalledWith(
      TableName.EventsFull,
      event,
      "2026-11-19T00:00:00.000Z",
    );
  });

  it("captures eval and trace intents without retaining the observation body", async () => {
    const effects: OtelEffect[] = [];
    const shadow = createNativeOtelShadowEffects(
      shadowInputs(captureFor(effects)),
    );
    const scheduler = shadow.createEvalSchedulerDeps("project", {
      observationRules: [],
      traceTranscriptRules: [],
    });

    const data = {
      trace_id: "trace",
      span_id: "observation",
      input: { secret: "do not retain" },
    };
    await scheduler.upsertJobExecution({
      id: "execution",
      projectId: "project",
      jobConfigurationId: "rule",
      jobInputTraceId: "trace",
      jobInputObservationId: "observation",
      jobTemplateId: null,
      status: JobExecutionStatus.PENDING,
    });
    const observationS3Path = await scheduler.uploadObservationToS3({
      projectId: "project",
      traceId: "trace",
      observationId: "observation",
      data,
    });
    await scheduler.enqueueEvalJob({
      jobExecutionId: "execution",
      projectId: "project",
      observationS3Path,
      delay: 0,
      evalTemplateType: EvalTemplateType.LLM_AS_JUDGE,
    });
    scheduler.collectTraceActivity({
      traceId: "trace",
      spanStartTimeISO: "2026-11-19T00:00:00.000Z",
      ruleIds: ["rule"],
      serializedEventBytes: 42,
    });
    await scheduler.flushTraceActivity();

    expect(effects).toHaveLength(4);
    expect(effects[0]).toEqual({
      kind: "eval-upsert",
      projectId: "project",
      jobExecutionId: "execution",
      jobConfigurationId: "rule",
    });
    expect(effects[1]).toEqual({
      kind: "eval-blob-upload",
      projectId: "project",
      traceId: "trace",
      observationId: "observation",
      observationHash: expect.any(String),
    });
    expect(effects[2]).toMatchObject({
      kind: "observation-eval",
      observationHash: expect.any(String),
      request: { jobExecutionId: "execution" },
    });
    expect(effects[2]).not.toHaveProperty("observation");
    expect(JSON.stringify(effects)).not.toContain("do not retain");
    expect(effects[3]).toEqual({
      kind: "trace-recording",
      projectId: "project",
      traceId: "trace",
      spanStartTimeISO: "2026-11-19T00:00:00.000Z",
      ruleIds: ["rule"],
      serializedEventBytes: 42,
    });
  });

  it("marks observation hashing failures as inconclusive capture failures", async () => {
    const effects: OtelEffect[] = [];
    const shadow = createNativeOtelShadowEffects(
      shadowInputs(captureFor(effects)),
    );
    const scheduler = shadow.createEvalSchedulerDeps("project", {
      observationRules: [],
      traceTranscriptRules: [],
    });
    const data = {
      toJSON: () => {
        throw new Error("unhashable observation");
      },
    };

    await expect(
      scheduler.uploadObservationToS3({
        projectId: "project",
        traceId: "trace",
        observationId: "observation",
        data,
      }),
    ).rejects.toThrow("unhashable observation");
    expect(effects).toEqual([
      {
        kind: "capture-failure",
        stage: "observation-hash",
        mode: "simulated",
        error: { type: "Error" },
      },
    ]);
  });
});
