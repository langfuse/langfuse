import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateOtelJson,
  type EarlyOtelBatch,
  type ExtractedOtelMedia,
  type MediaRestoreRequest,
} from "@langfuse/native";
import * as otelMediaUploads from "../../../../packages/shared/src/server/media/otelMediaUploads";

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
    linkMediaToTraceOrObservation: vi.fn(),
    uploadMediaForTrace: vi.fn(),
  };
});

vi.mock("@langfuse/shared/src/server", () => ({
  ...otelMediaUploads,
  getClickhouseEntityType: (eventType: string) =>
    eventType === "trace-create" ? "trace" : "observation",
  instrumentAsync: mocks.instrumentAsync,
  logger: mocks.logger,
  processOtelMedia: vi.fn(),
  recordDistribution: mocks.recordDistribution,
  recordIncrement: vi.fn(),
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createTestDescriptors(
  count: number,
  prefix: string,
  originalByteLength: number,
): ExtractedOtelMedia[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    reference: DEFAULT_MEDIA_REFERENCE.replace(
      "provider",
      `${prefix}-${index}`,
    ),
    contentType: "image/png",
    sha256Hash: `${prefix}-hash-${index}`,
    kind: "anthropic",
    originalByteLength,
    originalJsonDepth: 0,
  }));
}

function replaceReference(reference: string, mediaId: string) {
  return reference.replace(/\|id=[^|@]+/, `|id=${mediaId}`);
}

function createFakeMediaBatch({
  originalValue = "aGk=",
  entries,
}: {
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
      kind: "anthropic",
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
    originalMedia: vi.fn().mockResolvedValue(originalValue),
    originalMediaBatch: vi.fn(async (requests: MediaRestoreRequest[]) =>
      Promise.all(
        requests.map(({ index, jsonLayers }) =>
          batch.originalMedia(index, jsonLayers),
        ),
      ),
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

async function withExtractedBatch<T>(
  source: T,
  callback: (batch: EarlyOtelBatch, compacted: T) => Promise<void>,
): Promise<void> {
  const validated = await validateOtelJson(Buffer.from(JSON.stringify(source)));
  let batch: EarlyOtelBatch | undefined;
  try {
    batch = await validated.extract(true);
    await callback(batch, JSON.parse(batch.takeJsonBuffer().toString("utf8")));
  } finally {
    try {
      await batch?.dispose();
    } finally {
      await validated.dispose();
    }
  }
}

describe("processOtelEventMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadMediaForTrace.mockReset().mockResolvedValue({
      outcome: "uploaded",
      mediaId: "uploaded",
    });
    mocks.linkMediaToTraceOrObservation
      .mockReset()
      .mockResolvedValue(undefined);
  });

  it("processes only normalized direct events with media fields", async () => {
    const eventInput = {
      traceId: "trace-id",
      spanId: "observation-id",
      input: { role: "user" },
      name: "observation-name",
    };
    const processMedia = vi.fn().mockResolvedValue(processResult);

    const mediaPresence = await processOtelEventMedia({
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

    expect(mediaPresence).toBe("present");
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
      {
        write_path: "direct",
        media_path: "reference",
        media_presence: "present",
      },
    );
  });

  it("does not create a processing span when there are no media fields", async () => {
    const processMedia = vi.fn();

    const mediaPresence = await processOtelEventMedia({
      targets: createDirectOtelMediaTargets([
        { traceId: "trace-id", spanId: "observation-id" },
      ]),
      writePath: "direct",
      ...MEDIA_DESTINATION,
      fileKey: "file-key",
      processMedia,
    });

    expect(mediaPresence).toBe("absent");
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
        ...MEDIA_DESTINATION,
        fileKey: "file-key",
        processMedia,
      }),
    ).resolves.toBe("unknown");

    expect(mocks.recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.processing_duration_ms",
      expect.any(Number),
      {
        write_path: "direct",
        media_path: "reference",
        media_presence: "unknown",
      },
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
    await withExtractedBatch(original, async (batch, payload) => {
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
    await withExtractedBatch(original, async (batch, payload) => {
      const descriptors = batch.media;
      expect(descriptors).toHaveLength(3);
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
          contentBytes,
          sha256Hash: descriptors[0]!.sha256Hash,
        }),
      );
      expect(contentBytes.length).toBeLessThanOrEqual(
        descriptors[0]!.originalByteLength,
      );
      expect(
        mocks.linkMediaToTraceOrObservation.mock.calls.map(
          ([params]) => params,
        ),
      ).toEqual(
        ["output", "metadata"].map((field) => ({
          projectId: "project-id",
          traceId: "trace-id",
          observationId: "observation-id",
          mediaId: "uploaded",
          field,
          origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
        })),
      );
      const uploadedReference = replaceReference(
        descriptors[0]!.reference,
        "uploaded",
      );
      for (const field of ["input", "output", "metadata"] as const) {
        expect(JSON.stringify(payload[field])).toBe(
          JSON.stringify(original[field]).replace(encoded, uploadedReference),
        );
      }
    });
  });

  it.each([
    { name: "nested values", oneString: false },
    { name: "all references in one string", oneString: true },
  ])(
    "reserves upload capacity before decoding media: $name",
    async ({ oneString }) => {
      const reservedBytes = 64 * 1024 * 1024;
      const descriptors = createTestDescriptors(3, "weighted", reservedBytes);
      const { batch, mediaBody } = createFakeMediaBatch({
        entries: descriptors,
      });
      mediaBody.mockImplementation((index: number) =>
        Promise.resolve(Buffer.from([index])),
      );
      const gates = Array.from({ length: 3 }, () =>
        deferred<{ outcome: "uploaded"; mediaId: string }>(),
      );
      const uploadIndexes: number[] = [];
      mocks.uploadMediaForTrace.mockImplementation(
        async ({ contentBytes }: { contentBytes: Buffer }) => {
          const index = contentBytes[0]!;
          uploadIndexes.push(index);
          return gates[index]!.promise;
        },
      );
      const references = descriptors.map((entry) => entry.reference);
      const payload = {
        traceId: "trace-id",
        spanId: "observation-id",
        input: oneString
          ? references.join(" ")
          : [references[0], { nested: references.slice(1) }],
      };
      const resolving = resolveExtractedMedia({
        batch,
        targets: createDirectOtelMediaTargets([payload]),
        ...MEDIA_DESTINATION,
        writePath: "direct",
      });
      try {
        await vi.waitFor(() => expect(uploadIndexes).toHaveLength(2));
        expect(uploadIndexes).toEqual([0, 1]);
        expect(mediaBody.mock.calls.map(([index]) => index)).toEqual([0, 1]);

        gates[0]!.resolve({ outcome: "uploaded", mediaId: "uploaded-0" });
        await vi.waitFor(() => expect(mediaBody).toHaveBeenCalledTimes(3));
        expect(mediaBody.mock.calls.map(([index]) => index)).toEqual([0, 1, 2]);

        gates[2]!.resolve({ outcome: "uploaded", mediaId: "uploaded-2" });
        gates[1]!.resolve({ outcome: "uploaded", mediaId: "uploaded-1" });
        await expect(resolving).resolves.toMatchObject({
          uploaded: 3,
          reused: 0,
          failed: 0,
        });
      } finally {
        for (const gate of gates)
          gate.resolve({ outcome: "uploaded", mediaId: "cleanup" });
        await resolving.catch(() => undefined);
      }
    },
  );

  it.each([
    {
      name: "five strings",
      input: Array.from({ length: 5 }, () =>
        Array(5).fill(DEFAULT_MEDIA_REFERENCE).join(" "),
      ),
    },
    {
      name: "one string",
      input: Array(25).fill(DEFAULT_MEDIA_REFERENCE).join(" "),
    },
  ])(
    "bounds concurrent links for repeated early references: $name",
    async ({ input }) => {
      const { batch } = createFakeMediaBatch();
      const releaseLinks = deferred<void>();
      let activeLinks = 0;
      let peakLinks = 0;
      mocks.linkMediaToTraceOrObservation.mockImplementation(async () => {
        activeLinks++;
        peakLinks = Math.max(peakLinks, activeLinks);
        try {
          await releaseLinks.promise;
        } finally {
          activeLinks--;
        }
      });
      const payload = {
        traceId: "trace-id",
        spanId: "observation-id",
        input,
      };
      const resolving = resolveTarget(batch, payload);
      try {
        await vi.waitFor(() => expect(peakLinks).toBeGreaterThanOrEqual(5));
        expect(peakLinks).toBe(5);
      } finally {
        releaseLinks.resolve();
        await resolving;
      }
    },
  );

  it("uploads a descriptor without reading the batch media registry", async () => {
    const { batch, mediaBody: loadBody, readMedia } = createFakeMediaBatch();
    readMedia.mockImplementation(() => {
      throw new Error("media registry should not be read");
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
      byteLengthUpperBound: 5,
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

  it.each([4, 2 * 1024 * 1024])(
    "caches registry pages and batches restoration reads (%s source bytes)",
    async (sourceBytes) => {
      const entries = createTestDescriptors(4_097, "page", sourceBytes);
      const { batch, mediaCount, mediaPage } = createFakeMediaBatch({
        entries,
      });
      const reference = [...entries.slice(-65), entries.at(-1)!]
        .map((entry) => entry.reference)
        .join(" ");
      const first = { name: reference };
      const second = { name: reference };

      await restoreInlineMedia(batch, [first]);
      await restoreInlineMedia(batch, [second]);

      expect(first.name).toBe(Array(66).fill("aGk=").join(" "));
      expect(second.name).toBe(first.name);
      expect(
        vi
          .mocked(batch.originalMediaBatch)
          .mock.calls.map(([requests]) => requests.length),
      ).toEqual(sourceBytes === 4 ? [64, 1, 64, 1] : Array(130).fill(1));
      expect(mediaCount).toHaveBeenCalledOnce();
      expect(mediaPage).toHaveBeenCalledTimes(2);
      expect(mediaPage).toHaveBeenNthCalledWith(1, 0, 4_096);
      expect(mediaPage).toHaveBeenNthCalledWith(2, 4_096, 4_096);
    },
  );

  it("reuses uploads across destinations even after a failed link", async () => {
    const { batch, mediaPage, mediaBody } = createFakeMediaBatch({
      originalValue: "original-value",
    });
    const firstTarget = createProviderPayload(
      DEFAULT_MEDIA_REFERENCE,
      "legacy",
    );
    const failedTarget = createProviderPayload(
      DEFAULT_MEDIA_REFERENCE,
      "failed",
    );
    const directTarget = createProviderPayload(
      DEFAULT_MEDIA_REFERENCE,
      "direct",
    );

    await restoreInlineMedia(batch, [firstTarget, directTarget]);
    const first = await resolveTarget(batch, firstTarget, "legacy");
    mocks.linkMediaToTraceOrObservation.mockRejectedValueOnce(
      new Error("link failed"),
    );
    const failed = await resolveTarget(batch, failedTarget);
    const direct = await resolveTarget(batch, directTarget);

    expect(first).toMatchObject({ uploaded: 1, reused: 0, bytesProcessed: 5 });
    expect(failed).toMatchObject({ failed: 1, uploaded: 0, reused: 0 });
    expect(failedTarget.input.data).toBe("original-value");
    expect(direct).toMatchObject({
      failed: 0,
      uploaded: 0,
      reused: 1,
      bytesProcessed: 5,
    });
    expect(directTarget.input.data).toBe(
      replaceReference(DEFAULT_MEDIA_REFERENCE, "uploaded"),
    );
    expect(mediaPage).toHaveBeenCalledOnce();
    expect(mediaBody).toHaveBeenCalledOnce();
    expect(mocks.uploadMediaForTrace).toHaveBeenCalledOnce();
    expect(mocks.linkMediaToTraceOrObservation).toHaveBeenLastCalledWith({
      projectId: "project-id",
      traceId: "trace-id",
      observationId: "direct",
      mediaId: "uploaded",
      field: "input",
      origin: MediaAssociationOrigin.INGESTION_MEDIA_EXTRACTION,
    });
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
    await withExtractedBatch(input, async (batch, compacted) => {
      const media = batch.media;
      expect(media).toHaveLength(2);
      expect(media[0].reference).not.toBe(media[1].reference);
      expect(media[0].sha256Hash).toBe(media[1].sha256Hash);
      const target = {
        traceId: "trace-id",
        spanId: "observation-id",
        input: compacted,
      };
      const result = await resolveTarget(batch, target);
      expect(result).toMatchObject({ failed: 2, uploaded: 0, reused: 0 });
      expect(target.input).toEqual(input);
      // Distinct spellings share one failed attempt, then restore independently.
      expect(mocks.uploadMediaForTrace).toHaveBeenCalledOnce();
    });
  });

  const pythonLiteral = String.raw`b'${"a".repeat(4096)}\xff\xd8\xff\xe0test\nquote\'slash\\\x00'`;
  // The escaped marker keeps discovery active through the second JSON layer.
  const pythonProvider = String.raw`{
  "type": "file", "mediaType": "image/jpeg", "data": ${JSON.stringify(pythonLiteral)},
  "marker": "\u0061", "large": 9007199254740993
}`;
  const quoteProvider = String.raw`{"type":"file","mediaType":"text/plain","data":"b'${"a".repeat(4096)}\u0022'"}`;

  it.each([
    ...[1, 2].flatMap((layers) =>
      ["root", "object"].map((placement) => {
        const text =
          layers === 1
            ? pythonProvider
            : JSON.stringify({ child: pythonProvider });
        return {
          name: `Python bytes: ${placement}, ${layers} JSON layers`,
          input: placement === "root" ? text : { nested: text },
          addNormalizedLayer: false,
        };
      }),
    ),
    {
      name: "Unicode-escaped quotes with an extra normalization layer",
      input: `{"child":${JSON.stringify(quoteProvider).replace(/\\"/g, "\\u0022")}}`,
      addNormalizedLayer: true,
    },
  ])(
    "restores exact native text after upload failure: $name",
    async ({ input, addNormalizedLayer }) => {
      mocks.uploadMediaForTrace.mockRejectedValue(new Error("upload failed"));
      const original = { traceId: "trace-id", spanId: "observation-id", input };
      await withExtractedBatch(original, async (batch, target) => {
        expect(batch.media).toHaveLength(1);
        if (addNormalizedLayer)
          target.input = JSON.stringify({ content: target.input });
        expect(JSON.stringify(target.input)).toContain(
          batch.media[0]!.reference,
        );

        const result = await resolveTarget(batch, target);
        expect(result).toMatchObject({ failed: 1, uploaded: 0 });
        expect(mocks.uploadMediaForTrace).toHaveBeenCalledOnce();

        expect(target.input).toEqual(
          addNormalizedLayer ? JSON.stringify({ content: input }) : input,
        );
      });
    },
  );

  const escapedUri = String.raw`data:image\/png;base64,${String.raw`\/\/\/\/`.repeat(1024)}`;
  const dataUri = `data:image/png;base64,${"aGkh".repeat(1024)}`;
  it.each([
    {
      name: "escaped Data URI and unrelated slash spelling",
      input: String.raw`{
  "type": "file", "mediaType": "image\/png", "data": "${escapedUri}",
  "unrelated": "keep this \/ spelling"
}`,
      mediaText: escapedUri,
      failUpload: false,
      decodedBytes: Buffer.from("/".repeat(4096), "base64"),
    },
    ...[false, true].map((failUpload) => ({
      name: `unsafe integer spelling, upload ${failUpload ? "failure" : "success"}`,
      input: `{
  "type": "base64", "media_type": "image/png", "data": "${dataUri}",
  "large": 9007199254740993
}`,
      mediaText: dataUri,
      failUpload,
      decodedBytes: undefined,
    })),
  ])(
    "preserves native stringified text: $name",
    async ({ input, mediaText, failUpload, decodedBytes }) => {
      if (failUpload)
        mocks.uploadMediaForTrace.mockRejectedValue(new Error("upload failed"));
      await withExtractedBatch(
        { traceId: "trace-id", spanId: "observation-id", input },
        async (batch, target) => {
          expect(batch.media).toHaveLength(1);
          const reference = batch.media[0]!.reference;
          expect(target.input).toContain(reference);

          const result = await resolveTarget(batch, target);
          expect(result).toMatchObject({
            failed: Number(failUpload),
            uploaded: Number(!failUpload),
          });
          expect(mocks.uploadMediaForTrace).toHaveBeenCalledOnce();

          expect(target.input).toBe(
            input.replace(
              mediaText,
              failUpload ? mediaText : replaceReference(reference, "uploaded"),
            ),
          );
          if (decodedBytes)
            expect(mocks.uploadMediaForTrace).toHaveBeenCalledWith(
              expect.objectContaining({
                contentType: "image/png",
                contentBytes: decodedBytes,
              }),
            );
        },
      );
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
      { traceId: "trace-id", spanId: "observation-id", input: nested },
      async (batch, target) => {
        const references = batch.media.map((entry) => entry.reference);
        expect(references).toHaveLength(2);

        const result = await resolveTarget(batch, target);
        expect(result).toMatchObject({ uploaded: 2, failed: 0 });
        expect(target.input).toBe(
          nested
            .replace(
              `b'${"abc".repeat(2048)}'`,
              replaceReference(references[0]!, "abc"),
            )
            .replace(
              `b'${"def".repeat(2048)}'`,
              replaceReference(references[1]!, "def"),
            ),
        );
      },
    );
  });

  it("does not let an unterminated marker consume a later known reference", async () => {
    const { batch } = createFakeMediaBatch();
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

  it("rewrites known references without altering unrelated text in either walker", async () => {
    const { batch, mediaBody } = createFakeMediaBatch();
    const known = String.raw`{
  "large": 9007199254740993, "escaped": "\u0061",
  "data": "${DEFAULT_MEDIA_REFERENCE}"
}`;
    const unknown = String.raw`{ "large": 9007199254740993, "escaped": "\u0061", "ref": "@@@langfuseMedia:existing@@@" }`;
    const untouched = `{
  "type": "file", "mediaType": "image/png", "data": "https://example.com/image.png",
  "large": 9007199254740993
}`;
    const fields = { known, unknown, untouched };
    const record = {
      traceId: "trace-id",
      spanId: "observation-id",
      name: { ...fields },
      input: {
        type: "base64",
        media_type: "image/png",
        data: "https://example.com/image.png",
        ...fields,
      },
    };
    const original = structuredClone(record);

    await restoreInlineMedia(batch, [record]);
    expect(record).toEqual({
      ...original,
      name: {
        ...fields,
        known: known.replace(DEFAULT_MEDIA_REFERENCE, "aGk="),
      },
    });
    expect(mediaBody).not.toHaveBeenCalled();
    expect(mocks.uploadMediaForTrace).not.toHaveBeenCalled();

    await resolveTarget(batch, record);
    expect(record.input).toEqual({
      ...original.input,
      known: known.replace(
        DEFAULT_MEDIA_REFERENCE,
        replaceReference(DEFAULT_MEDIA_REFERENCE, "uploaded"),
      ),
    });
    expect(mediaBody).toHaveBeenCalledOnce();
    expect(mocks.uploadMediaForTrace).toHaveBeenCalledOnce();
  });
});
