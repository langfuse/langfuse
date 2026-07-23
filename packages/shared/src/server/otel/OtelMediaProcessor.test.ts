import { describe, expect, it, vi } from "vitest";

vi.mock("../instrumentation", () => ({
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
}));
vi.mock("../logger", () => ({
  logger: { warn: vi.fn() },
}));

import type { MediaField } from "../../domain/media";
import { recordDistribution, recordIncrement } from "../instrumentation";
import {
  processOtelMedia,
  type OtelMediaPayload,
  type OtelMediaTarget,
  type UploadOtelMedia,
} from "./OtelMediaProcessor";

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const SPAN_ID = "0123456789abcdef";
const MEDIA_ID = "test-media-id";
const PNG_BYTES = Buffer.from("test-image");
const PNG_BASE64 = PNG_BYTES.toString("base64");
const PYTHON_BYTES = Buffer.from([
  0xff,
  0xd8,
  0xff,
  0xe0,
  ...Buffer.from("test\nquote'slash\\"),
  0x00,
]);
const PYTHON_BYTES_LITERAL =
  "b'\\xff\\xd8\\xff\\xe0test\\nquote\\'slash\\\\\\x00'";
const MEDIA_REFERENCE = `@@@langfuseMedia:type=image/png|id=${MEDIA_ID}|source=base64_data_uri@@@`;

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
  it("uploads a normalized observation Data URI and replaces it after success", async () => {
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
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
      { path: "data_uri", write_path: "direct" },
    );
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.detection_check_byte_length",
      Buffer.byteLength(dataUri, "utf8"),
      { path: "data_uri", write_path: "direct" },
    );
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.byte_length",
      PNG_BYTES.length,
      {
        outcome: "uploaded",
        media_kind: "data_uri",
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
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
    const { event } = createEvent({ value: dataUri });

    await processEvents([event], createUploadMock("reused"));

    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.byte_length",
      PNG_BYTES.length,
      {
        outcome: "reused",
        media_kind: "data_uri",
      },
    );
  });

  it("processes every normalized media field and ignores unrelated fields", async () => {
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
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
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
    const { event, body } = createEvent({ value: `image: ${dataUri}` });

    await processEvents([event]);

    expect(body.input).toBe(`image: ${MEDIA_REFERENCE}`);
  });

  it.each([
    [
      "anthropic",
      { type: "base64", media_type: "image/png", data: PNG_BASE64 },
      "data",
    ],
    [
      "vertex",
      { type: "media", mime_type: "image/png", data: PNG_BASE64 },
      "data",
    ],
    [
      "gemini",
      { inline_data: { mime_type: "image/png", data: PNG_BASE64 } },
      "inline_data.data",
    ],
    [
      "ai_sdk_v6",
      { type: "file", mediaType: "image/png", data: PNG_BASE64 },
      "data",
    ],
    [
      "ai_sdk_v7",
      { type: "blob", mime_type: "image/png", content: PNG_BASE64 },
      "content",
    ],
  ])(
    "processes %s media in normalized structured values",
    async (_, mediaValue, referencePath) => {
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
      value: JSON.stringify({
        inline_data: {
          mime_type: "image/jpeg",
          data: PYTHON_BYTES_LITERAL,
        },
      }),
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
    const value = {
      inline_data: {
        mime_type: "image/jpeg",
        data: "b'\\xff\\x0g'",
      },
    };
    const { event, body } = createEvent({ value });
    const uploadMedia = createUploadMock();

    const result = await processEvents([event], uploadMedia);

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(body.input).toBe(value);
    expect(value.inline_data.data).toBe("b'\\xff\\x0g'");
    expect(result.invalid).toBe(1);
  });

  it("leaves normalized values unchanged when upload fails", async () => {
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
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
      },
    );
  });

  it("links trace-level media without an observation id", async () => {
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
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
