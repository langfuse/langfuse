import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
  env: {
    LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: "media-bucket",
    LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: "media/",
    LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES: 10,
  },
}));

import { processObservationFieldSpill } from "./processObservationFieldSpill";

describe("processObservationFieldSpill", () => {
  beforeEach(() => vi.clearAllMocks());

  it("logs an upload failure and persists the original oversized field", async () => {
    const originalInput = "x".repeat(11);
    const uploadError = new Error("S3 unavailable");
    mocks.uploadMediaForTrace.mockRejectedValue(uploadError);

    const result = await processObservationFieldSpill({
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
      "langfuse.ingestion.observation_field_spill",
      1,
      { field: "input", outcome: "failed" },
    );
  });

  it("records a successful spill and returns a field-limit media reference", async () => {
    mocks.uploadMediaForTrace.mockResolvedValue({
      mediaId: "media-id",
      outcome: "uploaded",
    });

    const result = await processObservationFieldSpill({
      projectId: "project-id",
      traceId: "trace-id",
      observationId: "observation-id",
      fields: { output: "x".repeat(11) },
    });

    expect(result.fields.output).toBe(
      "@@@langfuseMedia:type=text/plain|id=media-id|source=field_size_limit@@@",
    );
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
      "langfuse.ingestion.observation_field_spill",
      1,
      { field: "output", outcome: "uploaded" },
    );
  });
});
