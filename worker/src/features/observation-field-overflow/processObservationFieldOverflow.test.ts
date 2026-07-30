import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRecordInsertType } from "@langfuse/shared/src/server";

const mocks = vi.hoisted(() => {
  const span = { setAttributes: vi.fn() };
  return {
    env: {
      LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: "media-bucket" as string | undefined,
      LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: "media/",
      LANGFUSE_OBSERVATION_FIELD_OVERFLOW_ENABLED: "true",
      LANGFUSE_OBSERVATION_FIELD_SIZE_LIMIT_BYTES: 10,
    },
    instrumentAsync: vi.fn(
      async (
        _context: unknown,
        callback: (activeSpan: typeof span) => Promise<unknown>,
      ): Promise<unknown> => callback(span),
    ),
    logger: { warn: vi.fn() },
    recordDistribution: vi.fn(),
    recordIncrement: vi.fn(),
    span,
    uploadMediaForTrace: vi.fn(),
  };
});

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  instrumentAsync: mocks.instrumentAsync,
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

const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
};

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
    expect(mocks.instrumentAsync).not.toHaveBeenCalled();
    expect(mocks.uploadMediaForTrace).not.toHaveBeenCalled();
  });

  it("replaces oversized input, output, and metadata values by UTF-8 byte size", async () => {
    const input = "x".repeat(100);
    const output = "🔥".repeat(30);
    const metadata = "y".repeat(100);
    mocks.uploadMediaForTrace
      .mockResolvedValueOnce({ mediaId: "input-media", outcome: "uploaded" })
      .mockResolvedValueOnce({ mediaId: "output-media", outcome: "reused" })
      .mockResolvedValueOnce({
        mediaId: "metadata-media",
        outcome: "uploaded",
      });
    const eventRecord = createEventRecord({
      input,
      output,
      metadata_values: ["1234567890", metadata],
    });

    const result = await applyObservationFieldOverflow(eventRecord);

    expect(result).toMatchObject({
      input: mediaReference("input-media"),
      output: mediaReference("output-media"),
      metadata_values: ["1234567890", mediaReference("metadata-media")],
    });
    expect(eventRecord).toMatchObject({
      input,
      output,
      metadata_values: ["1234567890", metadata],
    });
    expect(mocks.uploadMediaForTrace).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        field: "output",
        contentBytes: Buffer.from(output),
      }),
    );
    expect(mocks.recordIncrement).toHaveBeenCalledTimes(3);
    expect(mocks.instrumentAsync).toHaveBeenCalledWith(
      {
        name: "langfuse.ingestion.observation_field_overflow.process",
      },
      expect.any(Function),
    );
    expect(mocks.span.setAttributes).toHaveBeenCalledWith({
      "langfuse.project.id": "project-id",
      "langfuse.trace.id": "trace-id",
      "langfuse.observation.id": "observation-id",
      "langfuse.ingestion.observation_field_overflow.candidates": 3,
      "langfuse.ingestion.observation_field_overflow.fields": [
        "input",
        "output",
        "metadata",
      ],
      "langfuse.ingestion.observation_field_overflow.uploaded": 2,
      "langfuse.ingestion.observation_field_overflow.reused": 1,
      "langfuse.ingestion.observation_field_overflow.failed": 0,
      "langfuse.ingestion.observation_field_overflow.bytes_processed": 320,
      "langfuse.ingestion.observation_field_overflow.bytes_removed":
        320 -
        Buffer.byteLength(mediaReference("input-media")) -
        Buffer.byteLength(mediaReference("output-media")) -
        Buffer.byteLength(mediaReference("metadata-media")),
    });
  });

  it("applies the limit to each metadata value rather than their aggregate size", async () => {
    const eventRecord = createEventRecord({
      metadata_values: ["123456", "123456"],
    });

    const result = await applyObservationFieldOverflow(eventRecord);

    expect(result.metadata_values).toEqual(["123456", "123456"]);
    expect(mocks.instrumentAsync).not.toHaveBeenCalled();
    expect(mocks.uploadMediaForTrace).not.toHaveBeenCalled();
  });

  it("uploads at most three oversized fields concurrently and preserves field order", async () => {
    const uploads = Array.from({ length: 5 }, () =>
      createDeferred<{ mediaId: string; outcome: "uploaded" }>(),
    );
    let activeUploads = 0;
    let maxActiveUploads = 0;
    let uploadIndex = 0;
    mocks.uploadMediaForTrace.mockImplementation(async () => {
      const currentIndex = uploadIndex++;
      activeUploads += 1;
      maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
      const result = await uploads[currentIndex].promise;
      activeUploads -= 1;
      return result;
    });
    const eventRecord = createEventRecord({
      input: "input-value",
      output: "output-value",
      metadata_values: ["metadata-one", "metadata-two", "metadata-three"],
    });

    const resultPromise = applyObservationFieldOverflow(eventRecord);

    await vi.waitFor(() =>
      expect(mocks.uploadMediaForTrace).toHaveBeenCalledTimes(3),
    );
    expect(maxActiveUploads).toBe(3);

    uploads[0].resolve({ mediaId: "input-media", outcome: "uploaded" });
    uploads[1].resolve({ mediaId: "output-media", outcome: "uploaded" });
    uploads[2].resolve({ mediaId: "metadata-one", outcome: "uploaded" });
    await vi.waitFor(() =>
      expect(mocks.uploadMediaForTrace).toHaveBeenCalledTimes(5),
    );
    expect(maxActiveUploads).toBe(3);

    uploads[3].resolve({ mediaId: "metadata-two", outcome: "uploaded" });
    uploads[4].resolve({ mediaId: "metadata-three", outcome: "uploaded" });

    await expect(resultPromise).resolves.toMatchObject({
      input: mediaReference("input-media"),
      output: mediaReference("output-media"),
      metadata_values: [
        mediaReference("metadata-one"),
        mediaReference("metadata-two"),
        mediaReference("metadata-three"),
      ],
    });
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
    expect(mocks.span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "langfuse.ingestion.observation_field_overflow.fields": [
          "input",
          "output",
        ],
        "langfuse.ingestion.observation_field_overflow.uploaded": 1,
        "langfuse.ingestion.observation_field_overflow.reused": 0,
        "langfuse.ingestion.observation_field_overflow.failed": 1,
        "langfuse.ingestion.observation_field_overflow.bytes_processed": 22,
        "langfuse.ingestion.observation_field_overflow.bytes_removed": 0,
      }),
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

  it("waits for the active batch before returning the original record on an unexpected failure", async () => {
    const processorError = new Error("metrics unavailable");
    const outputUpload = createDeferred<{
      mediaId: string;
      outcome: "uploaded";
    }>();
    mocks.uploadMediaForTrace
      .mockResolvedValueOnce({
        mediaId: "input-media",
        outcome: "uploaded",
      })
      .mockReturnValueOnce(outputUpload.promise);
    mocks.recordIncrement.mockImplementationOnce(() => {
      throw processorError;
    });
    const eventRecord = createEventRecord({
      input: "x".repeat(11),
      output: "y".repeat(11),
    });

    let didSettle = false;
    const resultPromise = applyObservationFieldOverflow(eventRecord).finally(
      () => {
        didSettle = true;
      },
    );

    await vi.waitFor(() =>
      expect(mocks.uploadMediaForTrace).toHaveBeenCalledTimes(2),
    );
    await Promise.resolve();
    expect(didSettle).toBe(false);

    outputUpload.resolve({ mediaId: "output-media", outcome: "uploaded" });

    await expect(resultPromise).resolves.toBe(eventRecord);
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
