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
    logger: { warn: vi.fn() },
    recordDistribution: vi.fn(),
    span,
  };
});

vi.mock("@langfuse/shared/src/server", () => ({
  getClickhouseEntityType: (eventType: string) =>
    eventType === "trace-create" ? "trace" : "observation",
  instrumentAsync: mocks.instrumentAsync,
  logger: mocks.logger,
  processOtelMedia: vi.fn(),
  recordDistribution: mocks.recordDistribution,
  uploadMediaForTrace: vi.fn(),
}));

import type { IngestionEventType } from "@langfuse/shared/src/server";
import {
  createDirectOtelMediaTargets,
  createLegacyOtelMediaTargets,
  processOtelEventMedia,
} from "./processOtelMedia";

const processResult = {
  uploaded: 1,
  reused: 2,
  invalid: 3,
  ignored: 4,
  failed: 5,
  bytesRemoved: 6,
  candidates: 7,
  bytesProcessed: 8,
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
};

describe("processOtelEventMedia", () => {
  beforeEach(() => vi.clearAllMocks());

  it("processes only normalized direct events with media fields", async () => {
    const eventInput = {
      traceId: "trace-id",
      spanId: "observation-id",
      input: { role: "user" },
      name: "observation-name",
    };
    const processMedia = vi.fn().mockResolvedValue(processResult);

    await processOtelEventMedia({
      targets: createDirectOtelMediaTargets([
        eventInput,
        { traceId: "trace-id", spanId: "without-media-fields" },
        { traceId: "trace-id", input: "missing-span-id" },
        null,
      ]),
      writePath: "direct",
      projectId: "project-id",
      fileKey: "file-key",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      processMedia,
    });

    expect(processMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: [
          {
            traceId: "trace-id",
            observationId: "observation-id",
            payload: eventInput,
          },
        ],
        writePath: "direct",
      }),
    );
    expect(mocks.instrumentAsync).toHaveBeenCalledWith(
      { name: "langfuse.ingestion.otel.media.process" },
      expect.any(Function),
    );
    expect(mocks.span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "langfuse.ingestion.otel.media.uploaded": 1,
        "langfuse.ingestion.otel.media.ignored": 4,
        "langfuse.ingestion.otel.media.bytes_processed": 8,
        "langfuse.ingestion.otel.media.write_path": "direct",
        "langfuse.ingestion.otel.media.detection_checks.stringified_json": 9,
        "langfuse.ingestion.otel.media.detection_checked_bytes.structured_payload": 12,
      }),
    );
    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.batch_byte_length",
      8,
      { write_path: "direct" },
    );
    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.batch_checked_byte_length",
      33,
      { write_path: "direct" },
    );
    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.processing_duration_ms",
      expect.any(Number),
      { write_path: "direct" },
    );
  });

  it("does not create a processing span when there are no media fields", async () => {
    const processMedia = vi.fn();

    await processOtelEventMedia({
      targets: createDirectOtelMediaTargets([
        { traceId: "trace-id", spanId: "observation-id" },
      ]),
      writePath: "direct",
      projectId: "project-id",
      fileKey: "file-key",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      processMedia,
    });

    expect(processMedia).not.toHaveBeenCalled();
    expect(mocks.instrumentAsync).not.toHaveBeenCalled();
  });

  it("fails open when media processing throws", async () => {
    const processMedia = vi.fn().mockRejectedValue(new Error("unexpected"));

    await expect(
      processOtelEventMedia({
        targets: createDirectOtelMediaTargets([
          {
            traceId: "trace-id",
            spanId: "observation-id",
            input: "input",
          },
        ]),
        writePath: "direct",
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
      { write_path: "direct" },
    );
    expect(mocks.recordDistribution).not.toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.batch_byte_length",
      expect.any(Number),
    );
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "OTEL media processing failed; continuing ingestion with original span values",
      expect.objectContaining({ projectId: "project-id", fileKey: "file-key" }),
    );
  });

  it("creates legacy targets that retain trace and observation body references", () => {
    const traceBody = {
      id: "trace-id",
      timestamp: "2026-07-23T00:00:00.000Z",
      input: "trace-input",
    };
    const observationBody = {
      id: "observation-id",
      traceId: "trace-id",
      startTime: "2026-07-23T00:00:00.000Z",
      input: "observation-input",
    };
    const events = [
      {
        id: "trace-event-id",
        type: "trace-create",
        timestamp: "2026-07-23T00:00:00.000Z",
        body: traceBody,
      },
      {
        id: "observation-event-id",
        type: "span-create",
        timestamp: "2026-07-23T00:00:00.000Z",
        body: observationBody,
      },
    ] as unknown as IngestionEventType[];

    expect(createLegacyOtelMediaTargets(events)).toEqual([
      { traceId: "trace-id", payload: traceBody },
      {
        traceId: "trace-id",
        observationId: "observation-id",
        payload: observationBody,
      },
    ]);
  });
});
