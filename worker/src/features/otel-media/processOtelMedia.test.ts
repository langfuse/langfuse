import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateOtelJson } from "@langfuse/native";

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
    recordIncrement: vi.fn(),
    span,
    linkMediaToTraceOrObservation: vi.fn(),
    uploadMediaForTrace: vi.fn(),
  };
});

vi.mock("@langfuse/shared/src/server", () => ({
  getClickhouseEntityType: (eventType: string) =>
    eventType === "trace-create" ? "trace" : "observation",
  instrumentAsync: mocks.instrumentAsync,
  logger: mocks.logger,
  processOtelMedia: vi.fn(),
  recordDistribution: mocks.recordDistribution,
  recordIncrement: mocks.recordIncrement,
  linkMediaToTraceOrObservation: mocks.linkMediaToTraceOrObservation,
  uploadMediaForTrace: mocks.uploadMediaForTrace,
}));

import { MediaAssociationOrigin } from "@langfuse/shared";
import type { IngestionEventType } from "@langfuse/shared/src/server";
import {
  createDirectOtelMediaTargets,
  createLegacyOtelMediaTargets,
  processOtelEventMedia,
} from "./processOtelMedia";
import { resolveExtractedMedia } from "./resolveExtractedMedia";

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
        mediaPath: "reference",
      }),
    );
    const uploadMedia = processMedia.mock.calls[0]?.[0].uploadMedia;
    await uploadMedia({
      projectId: "project-id",
      traceId: "trace-id",
      observationId: "observation-id",
      field: "input",
      contentType: "image/png",
      contentBytes: Buffer.from("media"),
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
    });
    expect(mocks.uploadMediaForTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
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
      { write_path: "direct", media_path: "reference" },
    );
    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.batch_checked_byte_length",
      33,
      { write_path: "direct", media_path: "reference" },
    );
    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.processing_duration_ms",
      expect.any(Number),
      { write_path: "direct", media_path: "reference" },
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

  it("attributes residual detector metrics to the early media path", async () => {
    const processMedia = vi.fn().mockResolvedValue(processResult);

    await processOtelEventMedia({
      earlyBatch: { media: [] } as never,
      targets: createDirectOtelMediaTargets([
        {
          traceId: "trace-id",
          spanId: "observation-id",
          input: "residual value",
        },
      ]),
      writePath: "direct",
      projectId: "project-id",
      fileKey: "file-key",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      processMedia,
    });

    expect(processMedia).toHaveBeenCalledWith(
      expect.objectContaining({ mediaPath: "early" }),
    );
    expect(mocks.span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "langfuse.ingestion.otel.media_path": "early",
      }),
    );
    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.batch_byte_length",
      8,
      { write_path: "direct", media_path: "early" },
    );
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
      { write_path: "direct", media_path: "reference" },
    );
    expect(mocks.recordDistribution).not.toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.batch_byte_length",
      expect.any(Number),
    );
    expect(mocks.span.setAttributes).toHaveBeenCalledWith({
      "langfuse.ingestion.otel.media_path": "reference",
    });
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      "OTEL media processing failed; continuing ingestion with original span values",
      expect.objectContaining({ projectId: "project-id", fileKey: "file-key" }),
    );
  });

  it("restores extracted media if the residual detector fails before reference resolution", async () => {
    const original = {
      traceId: "trace-id",
      spanId: "observation-id",
      input: "data:image/png;base64,aGVsbG8=",
    };
    const validated = await validateOtelJson(
      Buffer.from(JSON.stringify(original)),
    );
    const batch = await validated.extract(true);
    try {
      const payload = JSON.parse(batch.json());
      expect(payload.input).not.toBe(original.input);
      await processOtelEventMedia({
        earlyBatch: batch,
        targets: createDirectOtelMediaTargets([payload]),
        writePath: "direct",
        projectId: "project-id",
        fileKey: "file-key",
        mediaBucket: "media-bucket",
        mediaPrefix: "media/",
        processMedia: vi
          .fn()
          .mockRejectedValue(new Error("residual detector failed")),
      });
      expect(payload).toEqual(original);
      expect(mocks.uploadMediaForTrace).not.toHaveBeenCalled();
    } finally {
      await batch.dispose();
      await validated.dispose();
    }
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

  it("restores early references outside the legacy detector boundary", async () => {
    const reference =
      "@@@langfuseMedia:type=image/png|id=provider|source=bytes@@@";
    mocks.uploadMediaForTrace.mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    const batch = {
      media: [
        {
          index: 0,
          reference,
          contentType: "image/png",
          sha256Hash: "hash",
          kind: "anthropic",
          originalByteLength: 4,
        },
      ],
      mediaBody: vi.fn().mockResolvedValue(Buffer.from("media")),
      originalMedia: vi.fn().mockResolvedValue("aGk="),
    } as never;
    const deep = { value: reference } as Record<string, unknown>;
    let cursor = deep;
    for (let index = 0; index < 12; index++) {
      const next = { value: reference } as Record<string, unknown>;
      cursor.value = next;
      cursor = next;
    }
    const payload = {
      traceId: "trace-id",
      spanId: "observation-id",
      input: {
        provider: {
          type: "base64",
          media_type: "image/png",
          data: reference,
          unrelated: reference,
        },
        nested: JSON.stringify({
          type: "base64",
          media_type: "image/png",
          data: reference,
        }),
        deep,
        [reference]: "object key stays structural",
      },
    };

    const result = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([payload]),
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      writePath: "direct",
    });

    expect(result.uploaded).toBe(1);
    expect(payload.input.provider.data).toBe(
      "@@@langfuseMedia:type=image/png|id=uploaded|source=bytes@@@",
    );
    expect(payload.input.provider.unrelated).toBe("aGk=");
    expect(JSON.parse(payload.input.nested as string).data).toBe("aGk=");
    expect(JSON.stringify(payload.input.deep)).not.toContain(reference);
    expect(payload.input[reference]).toBe("object key stays structural");
    expect(batch.originalMedia).toHaveBeenCalledOnce();
    expect(mocks.recordIncrement).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media",
      1,
      {
        outcome: "uploaded",
        media_kind: "anthropic",
        write_path: "direct",
        media_path: "early",
      },
    );
    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.byte_length",
      5,
      {
        outcome: "uploaded",
        media_kind: "anthropic",
        write_path: "direct",
        media_path: "early",
      },
    );
  });

  it("reuses a decoded upload across targets while linking each destination", async () => {
    const reference =
      "@@@langfuseMedia:type=image/png|id=provider|source=bytes@@@";
    mocks.uploadMediaForTrace.mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    mocks.linkMediaToTraceOrObservation.mockResolvedValue(undefined);
    const batch = {
      media: [
        {
          index: 0,
          reference,
          contentType: "image/png",
          sha256Hash: "hash",
          kind: "anthropic",
          originalByteLength: 4,
        },
      ],
      mediaBody: vi.fn().mockResolvedValue(Buffer.from("media")),
      originalMedia: vi.fn().mockResolvedValue("aGk="),
    } as never;
    const providerInput = () => ({
      type: "base64",
      media_type: "image/png",
      data: reference,
    });
    const firstTarget = {
      traceId: "trace-id",
      spanId: "legacy-observation",
      input: providerInput(),
    };
    const secondTarget = {
      traceId: "trace-id",
      spanId: "direct-observation",
      input: providerInput(),
    };

    const first = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([firstTarget]),
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      writePath: "legacy",
    });
    const second = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([secondTarget]),
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      writePath: "direct",
    });

    expect(first).toMatchObject({ uploaded: 1, reused: 0, bytesProcessed: 5 });
    expect(second).toMatchObject({ uploaded: 0, reused: 1, bytesProcessed: 5 });
    expect(batch.mediaBody).toHaveBeenCalledOnce();
    expect(mocks.uploadMediaForTrace).toHaveBeenCalledOnce();
    expect(mocks.recordIncrement).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media",
      1,
      {
        outcome: "reused",
        media_kind: "anthropic",
        write_path: "direct",
        media_path: "early",
      },
    );
    expect(mocks.linkMediaToTraceOrObservation).toHaveBeenCalledWith({
      projectId: "project-id",
      traceId: "trace-id",
      observationId: "direct-observation",
      mediaId: "uploaded",
      field: "input",
      origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
    });
    expect(secondTarget.input).toMatchObject({
      data: "@@@langfuseMedia:type=image/png|id=uploaded|source=bytes@@@",
    });
  });

  it("restores a failed cache-hit link without poisoning a later destination", async () => {
    const reference =
      "@@@langfuseMedia:type=image/png|id=provider|source=bytes@@@";
    mocks.uploadMediaForTrace.mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    mocks.linkMediaToTraceOrObservation.mockResolvedValue(undefined);
    const batch = {
      media: [
        {
          index: 0,
          reference,
          contentType: "image/png",
          sha256Hash: "hash",
          kind: "anthropic",
          originalByteLength: 4,
        },
      ],
      mediaBody: vi.fn().mockResolvedValue(Buffer.from("media")),
      originalMedia: vi.fn().mockResolvedValue("original-value"),
    } as never;
    const target = (spanId: string) => ({
      traceId: "trace-id",
      spanId,
      input: {
        type: "base64",
        media_type: "image/png",
        data: reference,
      },
    });

    await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([target("first")]),
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      writePath: "legacy",
    });
    mocks.linkMediaToTraceOrObservation.mockRejectedValueOnce(
      new Error("link failed"),
    );
    const failedTarget = target("failed");
    const failed = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([failedTarget]),
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      writePath: "direct",
    });
    const recoveredTarget = target("recovered");
    const recovered = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([recoveredTarget]),
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      writePath: "direct",
    });

    expect(failed).toMatchObject({ failed: 1, uploaded: 0, reused: 0 });
    expect(failedTarget.input).toMatchObject({ data: "original-value" });
    expect(recovered).toMatchObject({ failed: 0, uploaded: 0, reused: 1 });
    expect(recoveredTarget.input).toMatchObject({
      data: "@@@langfuseMedia:type=image/png|id=uploaded|source=bytes@@@",
    });
    expect(batch.mediaBody).toHaveBeenCalledOnce();
    expect(mocks.uploadMediaForTrace).toHaveBeenCalledOnce();
    expect(mocks.recordIncrement).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media",
      1,
      {
        outcome: "failed",
        media_kind: "anthropic",
        write_path: "direct",
        media_path: "early",
      },
    );
  });

  it("evicts a failed upload so a later occurrence can retry", async () => {
    const reference =
      "@@@langfuseMedia:type=image/png|id=provider|source=bytes@@@";
    mocks.uploadMediaForTrace
      .mockRejectedValueOnce(new Error("upload failed"))
      .mockResolvedValueOnce({ outcome: "uploaded", mediaId: "retry" });
    const batch = {
      media: [
        {
          index: 0,
          reference,
          contentType: "image/png",
          sha256Hash: "hash",
          kind: "anthropic",
          originalByteLength: 4,
        },
      ],
      mediaBody: vi.fn().mockResolvedValue(Buffer.from("media")),
      originalMedia: vi.fn().mockResolvedValue("original-value"),
    } as never;
    const target = () => ({
      traceId: "trace-id",
      spanId: "observation-id",
      input: {
        type: "base64",
        media_type: "image/png",
        data: reference,
      },
    });

    const failed = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([target()]),
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      writePath: "direct",
    });
    const retriedTarget = target();
    const retried = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([retriedTarget]),
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      writePath: "direct",
    });

    expect(failed).toMatchObject({ failed: 1, uploaded: 0 });
    expect(retried).toMatchObject({ failed: 0, uploaded: 1 });
    expect(batch.mediaBody).toHaveBeenCalledTimes(2);
    expect(mocks.uploadMediaForTrace).toHaveBeenCalledTimes(2);
    expect(retriedTarget.input).toMatchObject({
      data: "@@@langfuseMedia:type=image/png|id=retry|source=bytes@@@",
    });
  });

  it("restores each source spelling after identical-content uploads fail", async () => {
    const input = [
      { type: "file", mediaType: "image/png", data: "YWJj" },
      { type: "file", mediaType: "image/png", data: "b'abc'" },
    ];
    const validated = await validateOtelJson(
      Buffer.from(JSON.stringify(input)),
    );
    const batch = await validated.extract(true);
    mocks.uploadMediaForTrace.mockRejectedValue(new Error("upload failed"));
    try {
      const media = batch.media;
      expect(media).toHaveLength(2);
      expect(media[0].reference).not.toBe(media[1].reference);
      expect(media[0].sha256Hash).toBe(media[1].sha256Hash);
      const target = {
        traceId: "trace-id",
        spanId: "observation-id",
        input: JSON.parse(batch.json()),
      };
      const result = await resolveExtractedMedia({
        batch,
        targets: createDirectOtelMediaTargets([target]),
        projectId: "project-id",
        mediaBucket: "media-bucket",
        mediaPrefix: "media/",
        writePath: "direct",
      });
      expect(result).toMatchObject({ failed: 2, uploaded: 0, reused: 0 });
      expect(target.input).toEqual(input);
      // Failures are not cached: the second occurrence can try its own upload.
      expect(mocks.uploadMediaForTrace).toHaveBeenCalledTimes(2);
    } finally {
      await batch.dispose();
      await validated.dispose();
    }
  });

  it.each([false, true] as const)(
    "resolves provider media at the legacy depth boundary (stringified=%s)",
    async (stringified) => {
      const reference =
        "@@@langfuseMedia:type=image/png|id=provider|source=bytes@@@";
      mocks.uploadMediaForTrace.mockResolvedValue({
        outcome: "uploaded",
        mediaId: "uploaded",
      });
      const batch = {
        media: [
          {
            index: 0,
            reference,
            contentType: "image/png",
            sha256Hash: "hash",
            kind: "anthropic",
            originalByteLength: 4,
          },
        ],
        mediaBody: vi.fn().mockResolvedValue(Buffer.from("media")),
        originalMedia: vi.fn().mockResolvedValue("aGk="),
      } as never;
      const provider = {
        type: "base64",
        media_type: "image/png",
        data: reference,
      } as Record<string, unknown>;
      let nested: Record<string, unknown> = provider;
      for (let depth = 1; depth < 10; depth++) {
        nested = { nested };
      }
      const payload = {
        traceId: "trace-id",
        spanId: "observation-id",
        input: stringified ? JSON.stringify(nested) : nested,
      };

      const result = await resolveExtractedMedia({
        batch,
        targets: createDirectOtelMediaTargets([payload]),
        projectId: "project-id",
        mediaBucket: "media-bucket",
        mediaPrefix: "media/",
        writePath: "direct",
      });

      expect(result).toMatchObject({ uploaded: 1, failed: 0 });
      const resolved = stringified
        ? JSON.parse(payload.input as string)
        : payload.input;
      let current = resolved as Record<string, unknown>;
      for (let depth = 1; depth < 10; depth++) {
        current = current.nested as Record<string, unknown>;
      }
      expect(current.data).toBe(
        "@@@langfuseMedia:type=image/png|id=uploaded|source=bytes@@@",
      );
    },
  );

  it("preserves a stringified provider payload when its upload fails", async () => {
    const reference =
      "@@@langfuseMedia:type=image/png|id=provider|source=bytes@@@";
    mocks.uploadMediaForTrace.mockRejectedValue(new Error("upload failed"));
    const batch = {
      media: [
        {
          index: 0,
          reference,
          contentType: "image/png",
          sha256Hash: "hash",
          kind: "anthropic",
          originalByteLength: 4,
        },
      ],
      mediaBody: vi.fn().mockResolvedValue(Buffer.from("media")),
      originalMedia: vi.fn().mockResolvedValue("ORIGINAL"),
    } as never;
    const original =
      '{\n  "type": "base64",\n  "media_type": "image/png",\n  "data": "ORIGINAL",\n  "large": 9007199254740993\n}';
    const withReference = original.replace('"ORIGINAL"', `"${reference}"`);
    const payload = {
      traceId: "trace-id",
      spanId: "observation-id",
      input: withReference,
    };

    await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([payload]),
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      writePath: "direct",
    });

    expect(payload.input).toBe(original);
  });

  it("leaves an untouched provider string byte-for-byte unchanged", async () => {
    const reference =
      "@@@langfuseMedia:type=image/png|id=provider|source=bytes@@@";
    const batch = {
      media: [
        {
          index: 0,
          reference,
          contentType: "image/png",
          sha256Hash: "hash",
          kind: "data_uri",
          originalByteLength: 4,
        },
      ],
      mediaBody: vi.fn().mockResolvedValue(Buffer.from("media")),
      originalMedia: vi.fn().mockResolvedValue("aGk="),
    } as never;
    const input =
      '{\n  "type": "file",\n  "mediaType": "image/png",\n  "data": "https://example.com/image.png",\n  "large": 9007199254740993\n}';
    const payload = {
      traceId: "trace-id",
      spanId: "observation-id",
      input,
    };

    await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([payload]),
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      writePath: "direct",
    });

    expect(payload.input).toBe(input);
    expect(batch.mediaBody).not.toHaveBeenCalled();
  });
});
