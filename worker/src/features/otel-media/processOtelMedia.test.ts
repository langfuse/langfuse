import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateOtelJson,
  type EarlyOtelBatch,
  type ExtractedOtelMedia,
} from "@langfuse/native";

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

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const { matchStructuredMedia, mayContainSerializedMedia } =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    matchStructuredMedia,
    mayContainSerializedMedia,
    getClickhouseEntityType: (eventType: string) =>
      eventType === "trace-create" ? "trace" : "observation",
    instrumentAsync: mocks.instrumentAsync,
    logger: mocks.logger,
    processOtelMedia: vi.fn(),
    recordDistribution: mocks.recordDistribution,
    recordIncrement: mocks.recordIncrement,
    linkMediaToTraceOrObservation: mocks.linkMediaToTraceOrObservation,
    uploadMediaForTrace: mocks.uploadMediaForTrace,
  };
});

import { MediaAssociationOrigin } from "@langfuse/shared";
import type { IngestionEventType } from "@langfuse/shared/src/server";
import {
  createDirectOtelMediaTargets,
  createLegacyOtelMediaTargets,
  processOtelEventMedia,
} from "./processOtelMedia";
import {
  resolveExtractedMedia,
  restoreInlineMedia,
  uploadExtractedMediaOnce,
} from "./resolveExtractedMedia";

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

const DEFAULT_MEDIA_REFERENCE =
  "@@@langfuseMedia:type=image/png|id=provider|source=bytes@@@";

const MEDIA_DESTINATION = {
  projectId: "project-id",
  mediaBucket: "media-bucket",
  mediaPrefix: "media/",
} as const;

function createFakeMediaBatch({
  kind = "anthropic",
  originalValue = "aGk=",
  entries,
}: {
  kind?: string;
  originalValue?: string;
  entries?: ExtractedOtelMedia[];
} = {}) {
  const mediaBody = vi.fn().mockResolvedValue(Buffer.from("media"));
  const descriptors = entries ?? [
    {
      index: 0,
      reference: DEFAULT_MEDIA_REFERENCE,
      contentType: "image/png",
      sha256Hash: "hash",
      kind,
      originalByteLength: 4,
      originalJsonDepth: 0,
    },
  ];
  const readMedia = vi.fn(() => descriptors);
  const mediaCount = vi.fn(() => descriptors.length);
  const mediaPage = vi.fn((offset: number, limit: number) =>
    descriptors.slice(offset, offset + limit),
  );
  const batch = {
    get media() {
      return readMedia();
    },
    mediaCount,
    mediaPage,
    mediaBody,
    originalMedia: vi
      .fn()
      .mockImplementation((_index: number, _jsonLayers?: number) =>
        Promise.resolve(originalValue),
      ),
  } as EarlyOtelBatch;
  return { batch, mediaBody, mediaCount, mediaPage, readMedia };
}

function createProviderPayload(reference: string, spanId = "observation-id") {
  return {
    traceId: "trace-id",
    spanId,
    input: {
      type: "base64",
      media_type: "image/png",
      data: reference,
    },
  };
}

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
      earlyBatch: {
        mediaCount: () => 0,
        mediaPage: () => [],
      } as never,
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
      input: `data:image/png;base64,${"aGVsbG8h".repeat(1024)}`,
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
    const reference = DEFAULT_MEDIA_REFERENCE;
    mocks.uploadMediaForTrace.mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    const { batch } = createFakeMediaBatch();
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
      ...MEDIA_DESTINATION,
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
    // The same occurrence reference appears in an actual object and in a
    // stringified document; those require different source-layer requests.
    expect(batch.originalMedia).toHaveBeenCalledTimes(2);
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

  it("uploads a descriptor without reading the batch media registry", async () => {
    const { batch, mediaBody: loadBody, readMedia } = createFakeMediaBatch();
    readMedia.mockImplementation(() => {
      throw new Error("media registry should not be read");
    });
    mocks.uploadMediaForTrace.mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    const result = await uploadExtractedMediaOnce({
      batch,
      projectId: "project-id",
      traceId: "trace-id",
      observationId: "observation-id",
      field: "input",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      sha256Hash: "hash",
      contentType: "image/png",
      loadBody,
    });

    expect(result).toEqual({
      outcome: "uploaded",
      mediaId: "uploaded",
      byteLength: 5,
    });
    expect(loadBody).toHaveBeenCalledOnce();
    expect(mocks.uploadMediaForTrace).toHaveBeenCalledOnce();
  });

  it("loads large media registries in cached pages", async () => {
    const entries = Array.from(
      { length: 4_097 },
      (_, index): ExtractedOtelMedia => ({
        index,
        reference: `@@@langfuseMedia:type=image/png|id=page-${index}|source=bytes@@@`,
        contentType: "image/png",
        sha256Hash: `hash-${index}`,
        kind: "anthropic",
        originalByteLength: 4,
        originalJsonDepth: 0,
      }),
    );
    const { batch, mediaCount, mediaPage } = createFakeMediaBatch({ entries });
    const reference = entries.at(-1)!.reference;
    const first = { name: reference };
    const second = { name: reference };

    await restoreInlineMedia(batch, [first]);
    await restoreInlineMedia(batch, [second]);

    expect(first.name).toBe("aGk=");
    expect(second.name).toBe("aGk=");
    expect(mediaCount).toHaveBeenCalledOnce();
    expect(mediaPage).toHaveBeenCalledTimes(2);
    expect(mediaPage).toHaveBeenNthCalledWith(1, 0, 4_096);
    expect(mediaPage).toHaveBeenNthCalledWith(2, 4_096, 4_096);
  });

  it("reuses a decoded upload across targets while linking each destination", async () => {
    const reference = DEFAULT_MEDIA_REFERENCE;
    mocks.uploadMediaForTrace.mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    mocks.linkMediaToTraceOrObservation.mockResolvedValue(undefined);
    const { batch, mediaPage, mediaBody } = createFakeMediaBatch();
    const firstTarget = createProviderPayload(reference, "legacy-observation");
    const secondTarget = createProviderPayload(reference, "direct-observation");

    await restoreInlineMedia(batch, [firstTarget, secondTarget]);
    const first = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([firstTarget]),
      ...MEDIA_DESTINATION,
      writePath: "legacy",
    });
    const second = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([secondTarget]),
      ...MEDIA_DESTINATION,
      writePath: "direct",
    });

    expect(first).toMatchObject({ uploaded: 1, reused: 0, bytesProcessed: 5 });
    expect(second).toMatchObject({ uploaded: 0, reused: 1, bytesProcessed: 5 });
    expect(mediaPage).toHaveBeenCalledOnce();
    expect(mediaBody).toHaveBeenCalledOnce();
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
    const reference = DEFAULT_MEDIA_REFERENCE;
    mocks.uploadMediaForTrace.mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    mocks.linkMediaToTraceOrObservation.mockResolvedValue(undefined);
    const { batch, mediaBody } = createFakeMediaBatch({
      originalValue: "original-value",
    });
    const target = (spanId: string) => createProviderPayload(reference, spanId);

    await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([target("first")]),
      ...MEDIA_DESTINATION,
      writePath: "legacy",
    });
    mocks.linkMediaToTraceOrObservation.mockRejectedValueOnce(
      new Error("link failed"),
    );
    const failedTarget = target("failed");
    const failed = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([failedTarget]),
      ...MEDIA_DESTINATION,
      writePath: "direct",
    });
    const recoveredTarget = target("recovered");
    const recovered = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([recoveredTarget]),
      ...MEDIA_DESTINATION,
      writePath: "direct",
    });

    expect(failed).toMatchObject({ failed: 1, uploaded: 0, reused: 0 });
    expect(failedTarget.input).toMatchObject({ data: "original-value" });
    expect(recovered).toMatchObject({ failed: 0, uploaded: 0, reused: 1 });
    expect(recoveredTarget.input).toMatchObject({
      data: "@@@langfuseMedia:type=image/png|id=uploaded|source=bytes@@@",
    });
    expect(mediaBody).toHaveBeenCalledOnce();
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
    const reference = DEFAULT_MEDIA_REFERENCE;
    mocks.uploadMediaForTrace
      .mockRejectedValueOnce(new Error("upload failed"))
      .mockResolvedValueOnce({ outcome: "uploaded", mediaId: "retry" });
    const { batch, mediaBody } = createFakeMediaBatch({
      originalValue: "original-value",
    });
    const target = () => createProviderPayload(reference);

    const failed = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([target()]),
      ...MEDIA_DESTINATION,
      writePath: "direct",
    });
    const retriedTarget = target();
    const retried = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([retriedTarget]),
      ...MEDIA_DESTINATION,
      writePath: "direct",
    });

    expect(failed).toMatchObject({ failed: 1, uploaded: 0 });
    expect(retried).toMatchObject({ failed: 0, uploaded: 1 });
    expect(mediaBody).toHaveBeenCalledTimes(2);
    expect(mocks.uploadMediaForTrace).toHaveBeenCalledTimes(2);
    expect(retriedTarget.input).toMatchObject({
      data: "@@@langfuseMedia:type=image/png|id=retry|source=bytes@@@",
    });
  });

  it("restores each source spelling after identical-content uploads fail", async () => {
    const content = "abc".repeat(2048);
    const input = [
      {
        type: "file",
        mediaType: "image/png",
        data: Buffer.from(content).toString("base64"),
      },
      { type: "file", mediaType: "image/png", data: `b'${content}'` },
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
        ...MEDIA_DESTINATION,
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
      const reference = DEFAULT_MEDIA_REFERENCE;
      mocks.uploadMediaForTrace.mockResolvedValue({
        outcome: "uploaded",
        mediaId: "uploaded",
      });
      const { batch } = createFakeMediaBatch();
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
        ...MEDIA_DESTINATION,
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

  it.each([
    ["generic", 1],
    ["generic", 2],
    ["root", 1],
    ["root", 2],
  ] as const)(
    "preserves escaped nested provider text (placement=%s, layers=%s)",
    async (placement, layers) => {
      mocks.uploadMediaForTrace.mockRejectedValue(new Error("upload failed"));
      const pythonLiteral = `b'${"a".repeat(4096)}\\xff\\xd8\\xff\\xe0test\\nquote\\'slash\\\\\\x00'`;
      // Keep the native serialized-media prefilter active through the second
      // stringification layer without adding another media occurrence.
      const nestedProvider = [
        '{\n  "type": "file",\n  "mediaType": "image/jpeg",\n  "data": ',
        JSON.stringify(pythonLiteral),
        ',\n  "marker": "\\u0061",\n  "large": 9007199254740993\n}',
      ].join("");
      const nestedContainer =
        layers === 1
          ? nestedProvider
          : JSON.stringify({ child: nestedProvider });
      const expectedInput =
        placement === "root" ? nestedContainer : { nested: nestedContainer };
      const source = JSON.stringify({
        traceId: "trace-id",
        spanId: "observation-id",
        input: expectedInput,
      });
      const validated = await validateOtelJson(Buffer.from(source));
      const batch = await validated.extract(true);
      try {
        expect(batch.media).toHaveLength(1);
        const target = JSON.parse(batch.json()) as {
          input: string | { nested: string };
        };
        const input = target.input;
        const serialized = typeof input === "string" ? input : input.nested;
        expect(serialized).toContain(batch.media[0]!.reference);

        await resolveExtractedMedia({
          batch,
          targets: createDirectOtelMediaTargets([target]),
          ...MEDIA_DESTINATION,
          writePath: "direct",
        });

        expect(target.input).toEqual(expectedInput);
      } finally {
        await batch.dispose();
        await validated.dispose();
      }
    },
  );

  it.each([
    [
      "escaped Data URI source text in a native nested document",
      () =>
        String.raw`{
  "type": "file",
  "mediaType": "image/png",
  "data": "data:image/png;base64,${String.raw`\/\/\/\/`.repeat(1024)}"
}`,
    ],
    [
      "Unicode-escaped quotes across two native string layers",
      () => {
        const provider = String.raw`{"type":"file","mediaType":"text/plain","data":"b'${"a".repeat(4096)}\u0022'"}`;
        const encodedProvider = JSON.stringify(provider).replace(
          /\\"/g,
          "\\u0022",
        );
        return `{"child":${encodedProvider}}`;
      },
    ],
  ] as const)("preserves %s", async (_name, createInput) => {
    mocks.uploadMediaForTrace.mockRejectedValue(new Error("upload failed"));
    const nestedProvider = createInput();
    const source = JSON.stringify({
      traceId: "trace-id",
      spanId: "observation-id",
      input: nestedProvider,
    });
    const validated = await validateOtelJson(Buffer.from(source));
    const batch = await validated.extract(true);
    try {
      expect(batch.media).toHaveLength(1);
      const target = JSON.parse(batch.json()) as { input: string };

      await resolveExtractedMedia({
        batch,
        targets: createDirectOtelMediaTargets([target]),
        ...MEDIA_DESTINATION,
        writePath: "direct",
      });

      expect(target.input).toBe(nestedProvider);
    } finally {
      await batch.dispose();
      await validated.dispose();
    }
  });

  it("matches native references by source occurrence when JSON reorders numeric keys", async () => {
    mocks.uploadMediaForTrace.mockImplementation(
      async ({ contentBytes }: { contentBytes: Buffer }) => ({
        outcome: "uploaded",
        mediaId: contentBytes.toString("utf8", 0, 3),
      }),
    );
    const first = `{"type":"file","mediaType":"image/png","data":"b'${"abc".repeat(2048)}'"}`;
    const second = `{"type":"file","mediaType":"image/png","data":"b'${"def".repeat(2048)}'"}`;
    // JSON.parse enumerates integer-like keys in ascending order even though
    // the source document visits key "2" before key "1".
    const nested = `{"2":${first},"1":${second}}`;
    const validated = await validateOtelJson(
      Buffer.from(
        JSON.stringify({
          traceId: "trace-id",
          spanId: "observation-id",
          input: nested,
        }),
      ),
    );
    const batch = await validated.extract(true);
    try {
      const target = JSON.parse(batch.json()) as { input: string };
      const references = batch.media.map((entry) => entry.reference);
      expect(references).toHaveLength(2);

      const result = await resolveExtractedMedia({
        batch,
        targets: createDirectOtelMediaTargets([target]),
        ...MEDIA_DESTINATION,
        writePath: "direct",
      });
      expect(result).toMatchObject({ uploaded: 2, failed: 0 });
      expect(target.input).toContain(
        references[0]!.replace(/\|id=[^|@]+/, "|id=abc"),
      );
      expect(target.input).toContain(
        references[1]!.replace(/\|id=[^|@]+/, "|id=def"),
      );
      expect(target.input).not.toContain("b'abc'");
      expect(target.input).not.toContain("b'def'");
    } finally {
      await batch.dispose();
      await validated.dispose();
    }
  });

  it("leaves an untouched provider string byte-for-byte unchanged", async () => {
    const { batch, mediaBody } = createFakeMediaBatch({
      kind: "data_uri",
    });
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
      ...MEDIA_DESTINATION,
      writePath: "direct",
    });

    expect(payload.input).toBe(input);
    expect(mediaBody).not.toHaveBeenCalled();
  });

  it("preserves stringified payload text after a successful upload", async () => {
    const reference = DEFAULT_MEDIA_REFERENCE;
    mocks.uploadMediaForTrace.mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    const { batch } = createFakeMediaBatch();
    const input = `{
  "type": "base64",
  "media_type": "image/png",
  "data": "${reference}",
  "large": 9007199254740993
}`;
    const payload = { traceId: "trace-id", spanId: "span-id", input };

    await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([payload]),
      ...MEDIA_DESTINATION,
      writePath: "direct",
    });

    expect(payload.input).toBe(
      input.replace(reference, reference.replace("provider", "uploaded")),
    );
  });

  it("keeps restored provider siblings separate from uploaded fields", async () => {
    mocks.uploadMediaForTrace.mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    const { batch } = createFakeMediaBatch();
    const inputObject = {
      type: "base64",
      media_type: "image/png",
      data: DEFAULT_MEDIA_REFERENCE,
      unrelated: DEFAULT_MEDIA_REFERENCE,
      [DEFAULT_MEDIA_REFERENCE]: "object key stays structural",
    };
    const input = JSON.stringify(inputObject);
    const payload = { traceId: "trace-id", spanId: "span-id", input };

    await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([payload]),
      ...MEDIA_DESTINATION,
      writePath: "direct",
    });

    expect(payload.input).toBe(
      JSON.stringify({
        ...inputObject,
        data: DEFAULT_MEDIA_REFERENCE.replace("id=provider", "id=uploaded"),
        unrelated: "aGk=",
      }),
    );
  });

  it.each([
    ["success", false],
    ["failure", true],
  ] as const)(
    "preserves native stringified payload text after a %s",
    async (_outcome, failUpload) => {
      const dataUri = `data:image/png;base64,${"aGkh".repeat(1024)}`;
      const input = `{
  "type": "base64",
  "media_type": "image/png",
  "data": "${dataUri}",
  "large": 9007199254740993
}`;
      const source = JSON.stringify({
        traceId: "trace-id",
        spanId: "span-id",
        input,
      });
      const validated = await validateOtelJson(Buffer.from(source));
      const batch = await validated.extract(true);
      try {
        const target = JSON.parse(batch.json()) as {
          traceId: string;
          spanId: string;
          input: string;
        };
        const reference = batch.media[0]!.reference;
        failUpload
          ? mocks.uploadMediaForTrace.mockRejectedValue(
              new Error("upload failed"),
            )
          : mocks.uploadMediaForTrace.mockResolvedValue({
              outcome: "uploaded",
              mediaId: "uploaded",
            });

        await resolveExtractedMedia({
          batch,
          targets: createDirectOtelMediaTargets([target]),
          ...MEDIA_DESTINATION,
          writePath: "direct",
        });

        expect(target.input).toContain("9007199254740993");
        expect(target.input).toBe(
          input.replace(
            dataUri,
            failUpload
              ? dataUri
              : reference.replace(/\|id=[^|@]+/, "|id=uploaded"),
          ),
        );
      } finally {
        await batch.dispose();
        await validated.dispose();
      }
    },
  );

  it("restores stringified payloads without normalizing unrelated text", async () => {
    const { batch } = createFakeMediaBatch({ originalValue: "aGk=" });
    const value = `{
  "large": 9007199254740993,
  "escaped": "\\u0061",
  "data": "${DEFAULT_MEDIA_REFERENCE}"
}`;
    const record = { name: value };

    await restoreInlineMedia(batch, [record]);

    expect(record.name).toBe(value.replace(DEFAULT_MEDIA_REFERENCE, "aGk="));
  });

  it("does not let an unterminated marker consume a later known reference", async () => {
    mocks.uploadMediaForTrace.mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    const { batch } = createFakeMediaBatch({ kind: "data_uri" });
    const prefix = "prefix @@@langfuseMedia:unterminated ";
    const payload = {
      traceId: "trace-id",
      spanId: "span-id",
      input: `${prefix}${DEFAULT_MEDIA_REFERENCE}`,
    };

    await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([payload]),
      ...MEDIA_DESTINATION,
      writePath: "direct",
    });

    expect(payload.input).toBe(
      `${prefix}${DEFAULT_MEDIA_REFERENCE.replace("provider", "uploaded")}`,
    );
  });

  it("resolves known data URI media beyond the legacy depth cap in stringified JSON", async () => {
    mocks.uploadMediaForTrace.mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    const { batch } = createFakeMediaBatch({ kind: "data_uri" });
    let nested: Record<string, unknown> = {
      type: "base64",
      media_type: "image/png",
      data: DEFAULT_MEDIA_REFERENCE,
    };
    for (let index = 0; index < 12; index++) nested = { nested };
    const payload = {
      traceId: "trace-id",
      spanId: "span-id",
      input: JSON.stringify(nested),
    };

    const result = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([payload]),
      ...MEDIA_DESTINATION,
      writePath: "direct",
    });

    expect(result).toMatchObject({ uploaded: 1, failed: 0 });
    expect(payload.input).toBe(
      (JSON.stringify(nested) as string).replace(
        DEFAULT_MEDIA_REFERENCE,
        DEFAULT_MEDIA_REFERENCE.replace("provider", "uploaded"),
      ),
    );
  });

  it("resolves deep data URI text without parsing adjacent provider media", async () => {
    const providerReference = DEFAULT_MEDIA_REFERENCE;
    const dataReference = DEFAULT_MEDIA_REFERENCE.replace(
      "id=provider",
      "id=data",
    );
    mocks.uploadMediaForTrace.mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    const { batch } = createFakeMediaBatch({
      originalValue: "provider-original",
      entries: [
        {
          index: 0,
          reference: providerReference,
          contentType: "image/png",
          sha256Hash: "provider-hash",
          kind: "anthropic",
          originalByteLength: 4,
          originalJsonDepth: 0,
        },
        {
          index: 1,
          reference: dataReference,
          contentType: "image/png",
          sha256Hash: "data-hash",
          kind: "data_uri",
          originalByteLength: 4,
          originalJsonDepth: 0,
        },
      ],
    });
    let nested: Record<string, unknown> = {
      provider: providerReference,
      data: dataReference,
    };
    for (let index = 0; index < 12; index++) nested = { nested };
    const payload = {
      traceId: "trace-id",
      spanId: "span-id",
      input: JSON.stringify(nested),
    };

    const result = await resolveExtractedMedia({
      batch,
      targets: createDirectOtelMediaTargets([payload]),
      ...MEDIA_DESTINATION,
      writePath: "direct",
    });

    expect(result).toMatchObject({ uploaded: 1, failed: 0 });
    expect(payload.input).toBe(
      JSON.stringify(nested)
        .replace(providerReference, "provider-original")
        .replace(
          dataReference,
          dataReference.replace("id=data", "id=uploaded"),
        ),
    );
  });

  it.each(["non-payload field", "provider sibling"])(
    "preserves unknown references in a %s during restoration",
    async (location) => {
      const validated = await validateOtelJson(
        Buffer.from(
          JSON.stringify({
            input: `data:image/png;base64,${"aGkh".repeat(1024)}`,
          }),
        ),
      );
      const batch = await validated.extract(true);
      const opaque =
        '{ "large": 9007199254740993, "escaped": "\\u0061", "ref": "@@@langfuseMedia:existing@@@" }';
      const record = {
        name: opaque,
        input: {
          type: "base64",
          media_type: "image/png",
          data: "https://example.com/image.png",
          other: opaque,
        },
      };
      try {
        expect(batch.media).toHaveLength(1);
        if (location === "non-payload field") {
          await restoreInlineMedia(batch, [record]);
          expect(record.name).toBe(opaque);
        } else {
          await resolveExtractedMedia({
            batch,
            targets: [{ traceId: "trace", payload: record }],
            projectId: "project",
            mediaBucket: "media-bucket",
            mediaPrefix: "media/",
            writePath: "direct",
          });
          expect(record.input.other).toBe(opaque);
        }
        expect(mocks.uploadMediaForTrace).not.toHaveBeenCalled();
      } finally {
        await batch.dispose();
      }
    },
  );
});
