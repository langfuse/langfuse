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

function resolveTarget(
  batch: EarlyOtelBatch,
  payload: unknown,
  writePath: "direct" | "legacy" = "direct",
) {
  return resolveExtractedMedia({
    batch,
    targets: createDirectOtelMediaTargets([payload]),
    ...MEDIA_DESTINATION,
    writePath,
  });
}

async function withExtractedBatch(
  source: string | object,
  callback: (batch: EarlyOtelBatch) => Promise<void>,
): Promise<void> {
  const validated = await validateOtelJson(
    Buffer.from(typeof source === "string" ? source : JSON.stringify(source)),
  );
  let batch: EarlyOtelBatch | undefined;
  try {
    batch = await validated.extract(true);
    await callback(batch);
  } finally {
    try {
      await batch?.dispose();
    } finally {
      await validated.dispose();
    }
  }
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
      ...MEDIA_DESTINATION,
      fileKey: "file-key",
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
      ...MEDIA_DESTINATION,
      fileKey: "file-key",
      processMedia,
    });

    expect(processMedia).not.toHaveBeenCalled();
    expect(mocks.instrumentAsync).not.toHaveBeenCalled();
  });

  it("attributes residual detector metrics to the early path after its empty batch is released", async () => {
    const processMedia = vi.fn().mockResolvedValue(processResult);

    await processOtelEventMedia({
      mediaPath: "early",
      targets: createDirectOtelMediaTargets([
        {
          traceId: "trace-id",
          spanId: "observation-id",
          input: "residual value",
        },
      ]),
      writePath: "direct",
      ...MEDIA_DESTINATION,
      fileKey: "file-key",
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
        ...MEDIA_DESTINATION,
        fileKey: "file-key",
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
    await withExtractedBatch(original, async (batch) => {
      const payload = JSON.parse(batch.takeJsonBuffer().toString("utf8"));
      expect(payload.input).not.toBe(original.input);
      await processOtelEventMedia({
        earlyBatch: batch,
        targets: createDirectOtelMediaTargets([payload]),
        writePath: "direct",
        ...MEDIA_DESTINATION,
        fileKey: "file-key",
        processMedia: vi
          .fn()
          .mockRejectedValue(new Error("residual detector failed")),
      });
      expect(payload).toEqual(original);
      expect(mocks.uploadMediaForTrace).not.toHaveBeenCalled();
    });
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

  it("uploads every known early reference in payload values", async () => {
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
          unrelated: reference,
          [reference]: "opaque string key",
        }),
        deep,
        [reference]: "object key stays structural",
      },
    };

    const result = await resolveTarget(batch, payload);

    expect(result).toMatchObject({
      uploaded: 1,
      reused: 5,
      failed: 0,
      candidates: 6,
      bytesProcessed: 30,
    });
    expect(payload.input.provider.data).toBe(
      "@@@langfuseMedia:type=image/png|id=uploaded|source=bytes@@@",
    );
    expect(payload.input.provider.unrelated).toBe(
      "@@@langfuseMedia:type=image/png|id=uploaded|source=bytes@@@",
    );
    const uploaded = reference.replace("id=provider", "id=uploaded");
    expect(JSON.parse(payload.input.nested as string)).toEqual({
      type: "base64",
      media_type: "image/png",
      data: uploaded,
      unrelated: uploaded,
      [uploaded]: "opaque string key",
    });
    expect(JSON.stringify(payload.input.deep)).not.toContain(reference);
    expect(payload.input[reference]).toBe("object key stays structural");
    expect(batch.originalMedia).not.toHaveBeenCalled();
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

  it("uploads native refs in deeply nested serialized input, output, and metadata", async () => {
    const contentBytes = Buffer.from("native-deep-media".repeat(512));
    const encoded = contentBytes.toString("base64");
    const provider = `{
  "type": "file",
  "mediaType": "image/png",
  "data": "${encoded}",
  "large": 9007199254740993
}`;
    const createDeepPayload = () => {
      let value: unknown = JSON.stringify(provider);
      for (let index = 0; index < 12; index++) value = { nested: value };
      return value;
    };
    const original = {
      traceId: "trace-id",
      spanId: "observation-id",
      input: createDeepPayload(),
      output: createDeepPayload(),
      metadata: createDeepPayload(),
    };
    await withExtractedBatch(original, async (batch) => {
      const descriptors = batch.media;
      expect(descriptors).toHaveLength(3);
      const payload = JSON.parse(batch.takeJsonBuffer().toString("utf8")) as {
        input: unknown;
        output: unknown;
        metadata: unknown;
      };
      mocks.uploadMediaForTrace.mockImplementation(
        async ({
          contentBytes: uploadedBytes,
          field,
        }: {
          contentBytes: Buffer;
          field: string;
        }) => {
          expect(uploadedBytes).toEqual(contentBytes);
          return { outcome: "uploaded", mediaId: `${field}-uploaded` };
        },
      );

      const result = await resolveTarget(batch, payload);

      expect(result).toMatchObject({
        uploaded: 1,
        reused: 2,
        failed: 0,
        candidates: 3,
        bytesProcessed: contentBytes.length * 3,
      });
      expect(mocks.uploadMediaForTrace).toHaveBeenCalledOnce();
      expect(mocks.uploadMediaForTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          field: "input",
          traceId: "trace-id",
          observationId: "observation-id",
        }),
      );
      expect(mocks.linkMediaToTraceOrObservation).toHaveBeenCalledTimes(2);
      expect(
        mocks.linkMediaToTraceOrObservation.mock.calls.map(
          ([params]) => params.field,
        ),
      ).toEqual(["output", "metadata"]);
      expect(
        mocks.linkMediaToTraceOrObservation.mock.calls.every(
          ([params]) =>
            params.mediaId === "input-uploaded" &&
            params.traceId === "trace-id" &&
            params.observationId === "observation-id",
        ),
      ).toBe(true);
      for (const field of ["input", "output", "metadata"] as const) {
        const uploadedReference = descriptors[0]!.reference.replace(
          /\|id=[^|@]+/,
          "|id=input-uploaded",
        );
        expect(JSON.stringify(payload[field])).toBe(
          JSON.stringify(original[field]).replace(encoded, uploadedReference),
        );
      }
    });
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
    const first = await resolveTarget(batch, firstTarget, "legacy");
    const second = await resolveTarget(batch, secondTarget);

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

    await resolveTarget(batch, target("first"), "legacy");
    mocks.linkMediaToTraceOrObservation.mockRejectedValueOnce(
      new Error("link failed"),
    );
    const failedTarget = target("failed");
    const failed = await resolveTarget(batch, failedTarget);
    const recoveredTarget = target("recovered");
    const recovered = await resolveTarget(batch, recoveredTarget);

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

    const failed = await resolveTarget(batch, target());
    const retriedTarget = target();
    const retried = await resolveTarget(batch, retriedTarget);

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
    mocks.uploadMediaForTrace.mockRejectedValue(new Error("upload failed"));
    await withExtractedBatch(input, async (batch) => {
      const media = batch.media;
      expect(media).toHaveLength(2);
      expect(media[0].reference).not.toBe(media[1].reference);
      expect(media[0].sha256Hash).toBe(media[1].sha256Hash);
      const target = {
        traceId: "trace-id",
        spanId: "observation-id",
        input: JSON.parse(batch.takeJsonBuffer().toString("utf8")),
      };
      const result = await resolveTarget(batch, target);
      expect(result).toMatchObject({ failed: 2, uploaded: 0, reused: 0 });
      expect(target.input).toEqual(input);
      // Failures are not cached: the second occurrence can try its own upload.
      expect(mocks.uploadMediaForTrace).toHaveBeenCalledTimes(2);
    });
  });

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
      await withExtractedBatch(source, async (batch) => {
        expect(batch.media).toHaveLength(1);
        const target = JSON.parse(batch.takeJsonBuffer().toString("utf8")) as {
          input: string | { nested: string };
        };
        const input = target.input;
        const serialized = typeof input === "string" ? input : input.nested;
        expect(serialized).toContain(batch.media[0]!.reference);

        await resolveTarget(batch, target);

        expect(target.input).toEqual(expectedInput);
      });
    },
  );

  it.each([
    [
      "escaped Data URI source text in a native nested document",
      () => {
        const mediaText = String.raw`data:image\/png;base64,${String.raw`\/\/\/\/`.repeat(1024)}`;
        const unrelatedText = String.raw`keep this \/ spelling`;
        return {
          source: String.raw`{
  "type": "file",
  "mediaType": "image\/png",
  "data": "${mediaText}",
  "unrelated": "${unrelatedText}"
}`,
          mediaText,
          unrelatedText,
          decodedBytes: Buffer.from("/".repeat(4096), "base64"),
        };
      },
      "success",
      false,
    ],
    [
      "Unicode-escaped quotes across two native string layers",
      () => {
        const provider = String.raw`{"type":"file","mediaType":"text/plain","data":"b'${"a".repeat(4096)}\u0022'"}`;
        const encodedProvider = JSON.stringify(provider).replace(
          /\\"/g,
          "\\u0022",
        );
        return {
          source: `{"child":${encodedProvider}}`,
          decodedBytes: undefined,
        };
      },
      "failure",
      true,
    ],
  ] as const)(
    "preserves %s after native extraction",
    async (_name, createInput, outcome, addNormalizedLayer) => {
      const fixture = createInput();
      const nestedProvider = fixture.source;
      const source = JSON.stringify({
        traceId: "trace-id",
        spanId: "observation-id",
        input: nestedProvider,
      });
      await withExtractedBatch(source, async (batch) => {
        expect(batch.media).toHaveLength(1);
        const originalMedia = addNormalizedLayer
          ? vi.spyOn(batch, "originalMedia")
          : undefined;
        const callsBeforeResolution = originalMedia?.mock.calls.length ?? 0;
        const target = JSON.parse(batch.takeJsonBuffer().toString("utf8")) as {
          input: string;
        };
        const reference = batch.media[0]!.reference;
        const normalizedInput = addNormalizedLayer
          ? JSON.stringify({ content: target.input })
          : target.input;
        target.input = normalizedInput;
        if (outcome === "failure") {
          mocks.uploadMediaForTrace.mockRejectedValue(
            new Error("upload failed"),
          );
        } else {
          mocks.uploadMediaForTrace.mockResolvedValue({
            outcome: "uploaded",
            mediaId: "uploaded",
          });
        }

        await resolveTarget(batch, target);

        if (addNormalizedLayer) {
          expect(
            originalMedia!.mock.calls.slice(callsBeforeResolution),
          ).toContainEqual([0, 3]);
        }
        const expectedInput =
          outcome === "failure" || fixture.mediaText === undefined
            ? addNormalizedLayer
              ? JSON.stringify({ content: nestedProvider })
              : nestedProvider
            : nestedProvider.replace(
                fixture.mediaText,
                reference.replace(/\|id=[^|@]+/, "|id=uploaded"),
              );
        expect(target.input).toBe(expectedInput);
        if (fixture.decodedBytes !== undefined) {
          expect(mocks.uploadMediaForTrace).toHaveBeenCalledWith(
            expect.objectContaining({
              contentType: "image/png",
              contentBytes: fixture.decodedBytes,
            }),
          );
        }
        if (fixture.unrelatedText !== undefined) {
          expect(target.input).toContain(fixture.unrelatedText);
        }
      });
    },
  );

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
    await withExtractedBatch(
      JSON.stringify({
        traceId: "trace-id",
        spanId: "observation-id",
        input: nested,
      }),
      async (batch) => {
        const target = JSON.parse(batch.takeJsonBuffer().toString("utf8")) as {
          input: string;
        };
        const references = batch.media.map((entry) => entry.reference);
        expect(references).toHaveLength(2);

        const result = await resolveTarget(batch, target);
        expect(result).toMatchObject({ uploaded: 2, failed: 0 });
        expect(target.input).toContain(
          references[0]!.replace(/\|id=[^|@]+/, "|id=abc"),
        );
        expect(target.input).toContain(
          references[1]!.replace(/\|id=[^|@]+/, "|id=def"),
        );
        expect(target.input).not.toContain("b'abc'");
        expect(target.input).not.toContain("b'def'");
      },
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
      await withExtractedBatch(source, async (batch) => {
        const target = JSON.parse(batch.takeJsonBuffer().toString("utf8")) as {
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

        await resolveTarget(batch, target);

        expect(target.input).toContain("9007199254740993");
        expect(target.input).toBe(
          input.replace(
            dataUri,
            failUpload
              ? dataUri
              : reference.replace(/\|id=[^|@]+/, "|id=uploaded"),
          ),
        );
      });
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

    await resolveTarget(batch, payload);

    expect(payload.input).toBe(
      `${prefix}${DEFAULT_MEDIA_REFERENCE.replace("provider", "uploaded")}`,
    );
  });

  it.each(["non-payload field", "provider sibling"])(
    "preserves unknown references in a %s during restoration",
    async (location) => {
      await withExtractedBatch(
        {
          input: `data:image/png;base64,${"aGkh".repeat(1024)}`,
        },
        async (batch) => {
          const opaque =
            '{ "large": 9007199254740993, "escaped": "\\u0061", "ref": "@@@langfuseMedia:existing@@@" }';
          const untouched =
            '{\n  "type": "file",\n  "mediaType": "image/png",\n  "data": "https://example.com/image.png",\n  "large": 9007199254740993\n}';
          const mediaBody = vi.spyOn(batch, "mediaBody");
          const record = {
            name: opaque,
            input: {
              type: "base64",
              media_type: "image/png",
              data: "https://example.com/image.png",
              other: opaque,
              untouched,
            },
          };
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
            expect(record.input.untouched).toBe(untouched);
          }
          expect(mediaBody).not.toHaveBeenCalled();
          expect(mocks.uploadMediaForTrace).not.toHaveBeenCalled();
        },
      );
    },
  );
});
