import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const span = { setAttributes: vi.fn() };
  return {
    instrumentAsync: vi.fn(
      async (
        _context: unknown,
        callback: (activeSpan: typeof span) => Promise<unknown>,
      ) => callback(span),
    ),
    recordDistribution: vi.fn(),
    span,
  };
});

vi.mock("@langfuse/shared/src/server", () => ({
  getClickhouseEntityType: vi.fn((type: string) =>
    type === "trace-create" ? "trace" : "observation",
  ),
  instrumentAsync: mocks.instrumentAsync,
  logger: { warn: vi.fn() },
  processOtelMedia: vi.fn(),
  recordDistribution: mocks.recordDistribution,
  uploadMediaForTrace: vi.fn(),
}));

import {
  createOtelMediaTargets,
  processOtelMediaIfEnabled,
} from "./processOtelMedia";

describe("createOtelMediaTargets", () => {
  it("selects only normalized input, output, and metadata fields", () => {
    const traceBody = {
      id: "trace-id",
      input: "trace-input",
      metadata: { source: "trace" },
      name: "trace-name",
    };
    const observationBody = {
      id: "observation-id",
      traceId: "trace-id",
      output: "observation-output",
    };
    const eventInput = {
      traceId: "trace-id",
      spanId: "observation-id",
      input: { role: "user" },
      name: "observation-name",
    };

    const targets = createOtelMediaTargets({
      ingestionEvents: [
        { type: "trace-create", body: traceBody } as never,
        { type: "span-create", body: observationBody } as never,
      ],
      eventInputs: [eventInput],
    });

    expect(targets).toEqual([
      {
        traceId: "trace-id",
        observationId: undefined,
        field: "input",
        body: traceBody,
      },
      {
        traceId: "trace-id",
        observationId: undefined,
        field: "metadata",
        body: traceBody,
      },
      {
        traceId: "trace-id",
        observationId: "observation-id",
        field: "output",
        body: observationBody,
      },
      {
        traceId: "trace-id",
        observationId: "observation-id",
        field: "input",
        body: eventInput,
      },
    ]);
  });
});

describe("processOtelMediaIfEnabled", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not invoke media processing when disabled", async () => {
    const processMedia = vi.fn();

    await processOtelMediaIfEnabled({
      enabled: false,
      targets: [],
      projectId: "project-id",
      fileKey: "file-key",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      processMedia,
    });

    expect(processMedia).not.toHaveBeenCalled();
  });

  it("invokes media processing when enabled", async () => {
    const processMedia = vi.fn().mockResolvedValue({
      uploaded: 1,
      reused: 2,
      invalid: 3,
      failed: 4,
      bytesRemoved: 5,
      candidates: 6,
      bytesProcessed: 7,
      detectionChecks: {
        data_uri: 8,
        stringified_json: 9,
        structured_payload: 10,
      },
      detectionCheckedBytes: {
        data_uri: 10,
        stringified_json: 11,
        structured_payload: 12,
      },
    });

    await processOtelMediaIfEnabled({
      enabled: true,
      targets: [],
      projectId: "project-id",
      fileKey: "file-key",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      processMedia,
    });

    expect(processMedia).toHaveBeenCalledTimes(1);
    expect(mocks.instrumentAsync).toHaveBeenCalledWith(
      { name: "langfuse.ingestion.otel.media.process" },
      expect.any(Function),
    );
    expect(mocks.span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "langfuse.ingestion.otel.media.uploaded": 1,
        "langfuse.ingestion.otel.media.bytes_processed": 7,
        "langfuse.ingestion.otel.media.detection_checks.stringified_json": 9,
        "langfuse.ingestion.otel.media.detection_checked_bytes.structured_payload": 12,
      }),
    );
    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.batch_byte_length",
      7,
    );
    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.batch_checked_byte_length",
      33,
    );
    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.processing_duration_ms",
      expect.any(Number),
    );
  });

  it("fails open when media processing throws", async () => {
    const processMedia = vi.fn().mockRejectedValue(new Error("unexpected"));

    await expect(
      processOtelMediaIfEnabled({
        enabled: true,
        targets: [],
        projectId: "project-id",
        fileKey: "file-key",
        mediaBucket: "media-bucket",
        mediaPrefix: "media/",
        processMedia,
      }),
    ).resolves.toBeUndefined();

    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.processing_duration_ms",
      expect.any(Number),
    );
    expect(mocks.recordDistribution).not.toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.batch_byte_length",
      expect.any(Number),
    );
  });
});
