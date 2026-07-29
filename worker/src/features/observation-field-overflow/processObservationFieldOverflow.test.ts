import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecordInsertType } from "@langfuse/shared/src/server";

const mocks = vi.hoisted(() => ({
  env: {
    LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: "media-bucket",
    LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: "media/",
    LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED: "true",
    LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES: 10,
  },
  logger: { warn: vi.fn() },
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
  uploadMediaForTrace: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  logger: mocks.logger,
  recordDistribution: mocks.recordDistribution,
  recordIncrement: mocks.recordIncrement,
  uploadMediaForTrace: mocks.uploadMediaForTrace,
}));

vi.mock("../../env", () => ({
  env: mocks.env,
}));

import {
  applyObservationFieldOverflow,
  processObservationFieldOverflow,
} from "./processObservationFieldOverflow";

describe("processObservationFieldOverflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED = "true";
  });

  it("returns the original event record when overflow is disabled", async () => {
    mocks.env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED = "false";
    const eventRecord = {
      project_id: "project-id",
      trace_id: "trace-id",
      span_id: "observation-id",
      input: "x".repeat(11),
    } as EventRecordInsertType;

    const result = await applyObservationFieldOverflow(eventRecord);

    expect(result).toBe(eventRecord);
    expect(mocks.uploadMediaForTrace).not.toHaveBeenCalled();
    expect(mocks.recordIncrement).not.toHaveBeenCalled();
    expect(mocks.recordDistribution).not.toHaveBeenCalled();
  });

  it("logs an upload failure and persists the original oversized field", async () => {
    const originalInput = "x".repeat(11);
    const uploadError = new Error("S3 unavailable");
    mocks.uploadMediaForTrace.mockRejectedValue(uploadError);

    const result = await processObservationFieldOverflow({
      projectId: "project-id",
      traceId: "trace-id",
      observationId: "observation-id",
      fields: { input: originalInput },
    });

    expect(result.fields.input).toBe(originalInput);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "Oversized observation field upload failed; persisting original field",
      {
        error: uploadError,
        projectId: "project-id",
        traceId: "trace-id",
        observationId: "observation-id",
        field: "input",
        originalBytes: 11,
      },
    );
    expect(mocks.recordIncrement).toHaveBeenCalledWith(
      "langfuse.ingestion.observation_field_overflow",
      1,
      { field: "input", outcome: "failed" },
    );
  });

  it("records a successful overflow and returns a field-limit media reference", async () => {
    const oversizedOutput = "x".repeat(100);
    const mediaReference =
      "@@@langfuseMedia:type=text/plain|id=media-id|source=field_size_limit@@@";
    mocks.uploadMediaForTrace.mockResolvedValue({
      mediaId: "media-id",
      outcome: "uploaded",
    });

    const result = await processObservationFieldOverflow({
      projectId: "project-id",
      traceId: "trace-id",
      observationId: "observation-id",
      fields: { output: oversizedOutput },
    });

    expect(result.fields.output).toBe(mediaReference);
    expect(mocks.uploadMediaForTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-id",
        traceId: "trace-id",
        observationId: "observation-id",
        field: "output",
        mediaBucket: "media-bucket",
        mediaPrefix: "media/",
      }),
    );
    expect(mocks.recordIncrement).toHaveBeenCalledWith(
      "langfuse.ingestion.observation_field_overflow",
      1,
      { field: "output", outcome: "uploaded" },
    );
    expect(mocks.recordDistribution).toHaveBeenCalledOnce();
    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.observation_field_overflow.bytes_removed",
      Buffer.byteLength(oversizedOutput) - Buffer.byteLength(mediaReference),
      { field: "output", outcome: "uploaded" },
    );
  });

  it("returns an overflowed event record without mutating the enriched record", async () => {
    mocks.uploadMediaForTrace
      .mockResolvedValueOnce({
        mediaId: "input-media",
        outcome: "uploaded",
      })
      .mockResolvedValueOnce({
        mediaId: "metadata-media",
        outcome: "uploaded",
      });
    const eventRecord = {
      project_id: "project-id",
      trace_id: "trace-id",
      span_id: "observation-id",
      input: "x".repeat(11),
      output: "small",
      metadata_values: ["small", "y".repeat(11)],
    } as EventRecordInsertType;

    const result = await applyObservationFieldOverflow(eventRecord);

    expect(result).not.toBe(eventRecord);
    expect(result).toMatchObject({
      input:
        "@@@langfuseMedia:type=text/plain|id=input-media|source=field_size_limit@@@",
      output: "small",
      metadata_values: [
        "small",
        "@@@langfuseMedia:type=text/plain|id=metadata-media|source=field_size_limit@@@",
      ],
    });
    expect(eventRecord).toMatchObject({
      input: "x".repeat(11),
      output: "small",
      metadata_values: ["small", "y".repeat(11)],
    });
  });
});
