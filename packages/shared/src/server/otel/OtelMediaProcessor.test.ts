import { describe, expect, it, vi } from "vitest";

vi.mock("../instrumentation", () => ({
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
}));
vi.mock("../logger", () => ({
  logger: { warn: vi.fn() },
}));

import type { MediaField } from "../../domain/media";
import { env } from "../../env";
import { recordDistribution, recordIncrement } from "../instrumentation";
import { mapMedia } from "../media/otelMediaUploads";
import {
  DATA_URI,
  MEDIA_ID,
  PNG_BYTES,
  PNG_BASE64,
  PYTHON_BYTES,
  PYTHON_STRINGIFIED_VALUE,
  MALFORMED_PYTHON_VALUE,
  providerMediaCases,
} from "../media/MediaPayloadProcessor.fixtures";
import {
  processOtelMedia,
  type OtelMediaPayload,
  type OtelMediaTarget,
  type UploadOtelMedia,
} from "./OtelMediaProcessor";

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const SPAN_ID = "0123456789abcdef";
const MEDIA_REFERENCE = `@@@langfuseMedia:type=image/png|id=${MEDIA_ID}|source=base64_data_uri@@@`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function createEvent(params: { value: unknown; field?: MediaField }): {
  event: OtelMediaTarget;
  body: OtelMediaPayload;
} {
  const body: OtelMediaPayload = {
    [params.field ?? "input"]: params.value,
  };
  return {
    event: {
      traceId: TRACE_ID,
      observationId: SPAN_ID,
      payload: body,
    },
    body,
  };
}

function createUploadMock(
  outcome: "uploaded" | "reused" = "uploaded",
): UploadOtelMedia {
  return vi.fn().mockResolvedValue({ mediaId: MEDIA_ID, outcome });
}

async function processEvents(
  targets: OtelMediaTarget[],
  uploadMedia: UploadOtelMedia = createUploadMock(),
) {
  return processOtelMedia({
    targets,
    projectId: "project-id",
    writePath: "direct",
    mediaBucket: "media-bucket",
    mediaPrefix: "media/",
    uploadMedia,
  });
}

describe("processOtelMedia", () => {
  it("preserves source order when concurrent uploads finish out of order and one fails", async () => {
    const uri = (id: number) =>
      `data:image/png;base64,${Buffer.from(String(id)).toString("base64")}`;
    const first = createEvent({ value: [1, 2, 3].map(uri).join(" ") });
    const second = createEvent({
      value: [4, 5, 6].map((id) => ({ image: uri(id) })),
    });
    const finish = new Map<number, () => void>();
    let active = 0;
    let peak = 0;
    const upload = vi.fn(async ({ contentBytes }: { contentBytes: Buffer }) => {
      const id = Number(contentBytes.toString());
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => finish.set(id, resolve));
      active--;
      if (id === 2) throw new Error("upload failed");
      return { mediaId: String(id), outcome: "uploaded" as const };
    });
    const jobs = [
      processEvents([first.event], upload),
      processEvents([second.event], upload),
    ];
    await vi.waitFor(() => expect(finish.size).toBe(6));
    expect(active).toBe(6);
    finish.get(3)!();
    for (const resolve of [...finish.values()].reverse()) resolve();
    const results = await Promise.all(jobs);
    const reference = (id: number) =>
      `@@@langfuseMedia:type=image/png|id=${id}|source=base64_data_uri@@@`;
    expect(peak).toBe(6);
    expect(first.body.input).toBe(`${reference(1)} ${uri(2)} ${reference(3)}`);
    expect(second.body.input).toEqual(
      [4, 5, 6].map((id) => ({ image: reference(id) })),
    );
    expect(
      results.map(({ uploaded, failed }) => ({ uploaded, failed })),
    ).toEqual([
      { uploaded: 2, failed: 1 },
      { uploaded: 3, failed: 0 },
    ]);
  });

  it("serializes duplicates before parsing another field", async () => {
    const first = deferred<void>();
    const { event } = createEvent({ value: `${DATA_URI} ${DATA_URI}` });
    const nextField = JSON.stringify({
      type: "base64",
      media_type: "image/png",
      data: Buffer.from("different").toString("base64"),
    });
    event.payload.output = nextField;
    const parse = vi.spyOn(JSON, "parse");
    const upload = vi.fn(async () => {
      if (upload.mock.calls.length === 1) await first.promise;
      return {
        mediaId: MEDIA_ID,
        outcome: upload.mock.calls.length === 2 ? "reused" : "uploaded",
      } as const;
    });
    const processing = processEvents([event], upload);

    try {
      await vi.waitFor(() => expect(upload).toHaveBeenCalled());
      expect(upload).toHaveBeenCalledTimes(1);
      expect(parse).not.toHaveBeenCalledWith(nextField);
    } finally {
      first.resolve();
      parse.mockRestore();
    }

    const result = await processing;
    expect(upload).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ uploaded: 2, reused: 1 });
  });

  it("uploads a normalized observation Data URI and replaces it after success", async () => {
    const dataUri = DATA_URI;
    const { event, body } = createEvent({ value: dataUri });
    const uploadMedia = createUploadMock();

    const result = await processEvents([event], uploadMedia);

    expect(uploadMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-id",
        traceId: TRACE_ID,
        observationId: SPAN_ID,
        field: "input",
        contentType: "image/png",
        contentBytes: PNG_BYTES,
      }),
    );
    expect(body.input).toBe(MEDIA_REFERENCE);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.detection_check",
      1,
      { path: "data_uri", write_path: "direct", media_path: "reference" },
    );
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.detection_check_byte_length",
      Buffer.byteLength(dataUri, "utf8"),
      { path: "data_uri", write_path: "direct", media_path: "reference" },
    );
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.byte_length",
      PNG_BYTES.length,
      {
        outcome: "uploaded",
        media_kind: "data_uri",
        write_path: "direct",
        media_path: "reference",
      },
    );
    expect(result).toMatchObject({
      candidates: 1,
      bytesProcessed: PNG_BYTES.length,
      detectionChecks: {
        data_uri: 1,
        stringified_json: 0,
        structured_payload: 0,
      },
      detectionCheckedBytes: {
        data_uri: Buffer.byteLength(dataUri, "utf8"),
        stringified_json: 0,
        structured_payload: 0,
      },
    });
  });

  it("tags reused media byte length separately from uploaded media", async () => {
    const dataUri = DATA_URI;
    const { event } = createEvent({ value: dataUri });

    await processEvents([event], createUploadMock("reused"));

    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.byte_length",
      PNG_BYTES.length,
      {
        outcome: "reused",
        media_kind: "data_uri",
        write_path: "direct",
        media_path: "reference",
      },
    );
  });

  it("processes every normalized media field and ignores unrelated fields", async () => {
    const dataUri = DATA_URI;
    const body = {
      input: dataUri,
      output: dataUri,
      metadata: { image: dataUri },
      unrelated: dataUri,
    };
    const uploadMedia = createUploadMock();

    await processEvents(
      [
        {
          traceId: TRACE_ID,
          observationId: SPAN_ID,
          payload: body,
        },
      ],
      uploadMedia,
    );

    expect(uploadMedia).toHaveBeenCalledTimes(3);
    expect(uploadMedia).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ field: "input" }),
    );
    expect(uploadMedia).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ field: "output" }),
    );
    expect(uploadMedia).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ field: "metadata" }),
    );
    expect(body).toMatchObject({
      input: MEDIA_REFERENCE,
      output: MEDIA_REFERENCE,
      metadata: { image: MEDIA_REFERENCE },
      unrelated: dataUri,
    });
  });

  it("replaces an embedded Data URI in a normalized string", async () => {
    const dataUri = DATA_URI;
    const { event, body } = createEvent({ value: `image: ${dataUri}` });

    await processEvents([event]);

    expect(body.input).toBe(`image: ${MEDIA_REFERENCE}`);
  });

  it.each(providerMediaCases)(
    "processes $name media in normalized structured values",
    async ({ value: mediaValue, referencePath }) => {
      const value = [structuredClone(mediaValue)];
      const { event } = createEvent({ value });
      const uploadMedia = createUploadMock();

      const result = await processEvents([event], uploadMedia);

      const reference = referencePath
        .split(".")
        .reduce((nested, key) => nested[key], value[0] as any) as string;
      expect(reference).toBe(
        `@@@langfuseMedia:type=image/png|id=${MEDIA_ID}|source=bytes@@@`,
      );
      expect(uploadMedia).toHaveBeenCalledTimes(1);
      expect(result.detectionChecks.structured_payload).toBe(1);
    },
  );

  it("processes shape-based media in stringified JSON", async () => {
    const { event, body } = createEvent({
      value: JSON.stringify([
        { type: "base64", media_type: "image/png", data: PNG_BASE64 },
      ]),
    });

    const result = await processEvents([event]);

    expect(JSON.parse(body.input as string)[0].data).toBe(
      `@@@langfuseMedia:type=image/png|id=${MEDIA_ID}|source=bytes@@@`,
    );
    expect(result.detectionChecks.stringified_json).toBe(1);
  });

  it("processes Gemini media serialized as a Python bytes literal", async () => {
    const { event, body } = createEvent({
      value: PYTHON_STRINGIFIED_VALUE,
    });
    const uploadMedia = createUploadMock();

    const result = await processEvents([event], uploadMedia);

    expect(uploadMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: "image/jpeg",
        contentBytes: PYTHON_BYTES,
      }),
    );
    expect(JSON.parse(body.input as string).inline_data.data).toBe(
      `@@@langfuseMedia:type=image/jpeg|id=${MEDIA_ID}|source=bytes@@@`,
    );
    expect(result).toMatchObject({
      uploaded: 1,
      invalid: 0,
      ignored: 0,
      candidates: 1,
      bytesProcessed: PYTHON_BYTES.length,
    });
  });

  it("leaves malformed Python bytes literals unchanged", async () => {
    const value = structuredClone(MALFORMED_PYTHON_VALUE);
    const { event, body } = createEvent({ value });
    const uploadMedia = createUploadMock();

    const result = await processEvents([event], uploadMedia);

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(body.input).toBe(value);
    expect(value.inline_data.data).toBe("b'\\xff\\x0g'");
    expect(result.invalid).toBe(1);
  });

  it("leaves normalized values unchanged when upload fails", async () => {
    const dataUri = DATA_URI;
    const { event, body } = createEvent({ value: dataUri });
    const uploadMedia = vi.fn().mockRejectedValue(new Error("upload failed"));

    await processEvents([event], uploadMedia);

    expect(body.input).toBe(dataUri);
  });

  it("ignores existing media references", async () => {
    const reference =
      "@@@langfuseMedia:type=image/png|id=existing|source=bytes@@@";
    const { event, body } = createEvent({ value: reference });
    const uploadMedia = createUploadMock();

    await processEvents([event], uploadMedia);

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(body.input).toBe(reference);
  });

  it("classifies unsupported Data URI content types as ignored", async () => {
    const value = "data:application/x-test;base64,dGVzdA==";
    const { event, body } = createEvent({ value });
    const uploadMedia = createUploadMock();

    const result = await processEvents([event], uploadMedia);

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(body.input).toBe(value);
    expect(result.invalid).toBe(0);
    expect(result.ignored).toBe(1);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media",
      1,
      {
        outcome: "ignored",
        media_kind: "data_uri",
        reason: "unsupported_content_type",
        write_path: "direct",
        media_path: "reference",
      },
    );
  });

  it("classifies malformed Data URI base64 as invalid", async () => {
    const value = "data:image/png;base64,%%%";
    const { event, body } = createEvent({ value });
    const uploadMedia = createUploadMock();

    const result = await processEvents([event], uploadMedia);

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(body.input).toBe(value);
    expect(result.invalid).toBe(1);
    expect(result.ignored).toBe(0);
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media",
      1,
      {
        outcome: "invalid",
        media_kind: "data_uri",
        reason: "invalid_base64",
        write_path: "direct",
        media_path: "reference",
      },
    );
  });

  it("links trace-level media without an observation id", async () => {
    const dataUri = DATA_URI;
    const body = { input: dataUri };
    const uploadMedia = createUploadMock();

    await processEvents([{ traceId: TRACE_ID, payload: body }], uploadMedia);

    expect(uploadMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: TRACE_ID,
        observationId: undefined,
      }),
    );
    expect(body.input).toBe(MEDIA_REFERENCE);
  });
});

describe("mapMedia", () => {
  it("keeps traversal fan-out bounded when the shared pool allows more uploads", async () => {
    const previousConcurrency = env.LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY;
    env.LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY = 100;
    const gate = deferred<void>();
    const started: number[] = [];
    try {
      const mapping = mapMedia(
        Array.from({ length: 20 }, (_, index) => index),
        async (value) => {
          started.push(value);
          await gate.promise;
          return value;
        },
      );
      expect(started).toEqual([0, 1, 2, 3, 4]);
      gate.resolve();
      await expect(mapping).resolves.toEqual(
        Array.from({ length: 20 }, (_, index) => index),
      );
    } finally {
      gate.resolve();
      env.LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY = previousConcurrency;
    }
  });

  it("drains active work after failure without pulling unused values", async () => {
    const previousConcurrency = env.LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY;
    env.LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY = 2;

    try {
      const held = deferred<number>();
      let pulls = 0;
      const values = (function* () {
        while (true) yield pulls++;
      })();
      const failure = new Error("upload failed");
      const failedMap = mapMedia(values, async (value) => {
        if (value === 0) throw failure;
        return held.promise;
      });
      let settled = false;
      failedMap.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );

      await Promise.resolve();
      expect(pulls).toBe(2);
      expect(settled).toBe(false);

      held.resolve(1);
      await expect(failedMap).rejects.toBe(failure);
      expect(pulls).toBe(2);

      const completions = [
        deferred<number>(),
        deferred<number>(),
        deferred<number>(),
      ];
      const orderedMap = mapMedia(
        [0, 1, 2],
        async (value) => completions[value].promise,
      );
      completions[1].resolve(1);
      completions[0].resolve(0);
      completions[2].resolve(2);
      await expect(orderedMap).resolves.toEqual([0, 1, 2]);
    } finally {
      env.LANGFUSE_OTEL_MEDIA_UPLOAD_CONCURRENCY = previousConcurrency;
    }
  });
});
