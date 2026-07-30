import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecordInsertType } from "@langfuse/shared/src/server";

const mocks = vi.hoisted(() => ({
  env: {
    LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: "media-bucket" as string | undefined,
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

import { applyObservationFieldOverflow } from "./processObservationFieldOverflow";

const createEventRecord = (
  fields: Partial<EventRecordInsertType> = {},
): EventRecordInsertType =>
  ({
    project_id: "project-id",
    trace_id: "trace-id",
    span_id: "observation-id",
    metadata_values: [],
    ...fields,
  }) as EventRecordInsertType;

const mediaReference = (id: string) =>
  `@@@langfuseMedia:type=text/plain|id=${id}|source=field_size_limit@@@`;

describe("applyObservationFieldOverflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadMediaForTrace.mockReset();
    mocks.recordDistribution.mockReset();
    mocks.recordIncrement.mockReset();
    mocks.env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET = "media-bucket";
    mocks.env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED = "true";
    mocks.env.LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES = 10;
  });

  it("returns the original event record when overflow is disabled", async () => {
    mocks.env.LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED = "false";
    const eventRecord = createEventRecord({ input: "x".repeat(11) });

    const result = await applyObservationFieldOverflow(eventRecord);

    expect(result).toBe(eventRecord);
    expect(mocks.uploadMediaForTrace).not.toHaveBeenCalled();
  });

  it("replaces oversized input, output, and metadata values by UTF-8 byte size", async () => {
    mocks.uploadMediaForTrace
      .mockResolvedValueOnce({ mediaId: "input-media", outcome: "uploaded" })
      .mockResolvedValueOnce({ mediaId: "output-media", outcome: "reused" })
      .mockResolvedValueOnce({
        mediaId: "metadata-media",
        outcome: "uploaded",
      });
    const eventRecord = createEventRecord({
      input: "x".repeat(11),
      output: "🔥🔥🔥",
      metadata_values: ["1234567890", "y".repeat(11)],
    });

    const result = await applyObservationFieldOverflow(eventRecord);

    expect(result).toMatchObject({
      input: mediaReference("input-media"),
      output: mediaReference("output-media"),
      metadata_values: ["1234567890", mediaReference("metadata-media")],
    });
    expect(eventRecord).toMatchObject({
      input: "x".repeat(11),
      output: "🔥🔥🔥",
      metadata_values: ["1234567890", "y".repeat(11)],
    });
    expect(mocks.uploadMediaForTrace).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        field: "output",
        contentBytes: Buffer.from("🔥🔥🔥"),
      }),
    );
    expect(mocks.recordIncrement).toHaveBeenCalledTimes(3);
  });

  it("applies the limit to each metadata value rather than their aggregate size", async () => {
    const eventRecord = createEventRecord({
      metadata_values: ["123456", "123456"],
    });

    const result = await applyObservationFieldOverflow(eventRecord);

    expect(result.metadata_values).toEqual(["123456", "123456"]);
    expect(mocks.uploadMediaForTrace).not.toHaveBeenCalled();
  });

  it("keeps an individual field when its upload fails and continues processing", async () => {
    const uploadError = new Error("S3 unavailable");
    mocks.uploadMediaForTrace
      .mockRejectedValueOnce(uploadError)
      .mockResolvedValueOnce({ mediaId: "output-media", outcome: "uploaded" });
    const eventRecord = createEventRecord({
      input: "x".repeat(11),
      output: "y".repeat(11),
    });

    const result = await applyObservationFieldOverflow(eventRecord);

    expect(result.input).toBe(eventRecord.input);
    expect(result.output).toBe(mediaReference("output-media"));
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

  it("logs once and returns the original oversized record when media storage is not configured", async () => {
    mocks.env.LANGFUSE_S3_MEDIA_UPLOAD_BUCKET = undefined;
    await applyObservationFieldOverflow(
      createEventRecord({ input: "within cap" }),
    );
    expect(mocks.logger.warn).not.toHaveBeenCalled();

    const eventRecord = createEventRecord({
      input: "x".repeat(11),
      output: "y".repeat(11),
    });

    const result = await applyObservationFieldOverflow(eventRecord);

    expect(result).toBe(eventRecord);
    expect(mocks.uploadMediaForTrace).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledOnce();
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "Observation field overflow processing failed; persisting original record",
      expect.objectContaining({
        error: expect.objectContaining({
          message: "Media upload bucket is not configured",
        }),
        projectId: "project-id",
        traceId: "trace-id",
        observationId: "observation-id",
      }),
    );
  });

  it("returns the original record when the processor fails outside an upload", async () => {
    const processorError = new Error("metrics unavailable");
    mocks.uploadMediaForTrace.mockResolvedValue({
      mediaId: "input-media",
      outcome: "uploaded",
    });
    mocks.recordIncrement.mockImplementationOnce(() => {
      throw processorError;
    });
    const eventRecord = createEventRecord({ input: "x".repeat(11) });

    const result = await applyObservationFieldOverflow(eventRecord);

    expect(result).toBe(eventRecord);
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "Observation field overflow processing failed; persisting original record",
      {
        error: processorError,
        projectId: "project-id",
        traceId: "trace-id",
        observationId: "observation-id",
      },
    );
  });
});
