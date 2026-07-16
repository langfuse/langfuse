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
  type OtelMediaTarget,
  type UploadOtelMedia,
} from "./OtelMediaProcessor";

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const SPAN_ID = "0123456789abcdef";
const MEDIA_ID = "test-media-id";
const PNG_BYTES = Buffer.from("test-image");
const PNG_BASE64 = PNG_BYTES.toString("base64");
const MEDIA_REFERENCE = `@@@langfuseMedia:type=image/png|id=${MEDIA_ID}|source=base64_data_uri@@@`;

function createTarget(params: {
  value: unknown;
  field?: MediaField;
  observationId?: string;
}): { target: OtelMediaTarget; body: Record<string, unknown> } {
  const body = { [params.field ?? "input"]: params.value };
  return {
    target: {
      traceId: TRACE_ID,
      observationId: params.observationId,
      field: params.field ?? "input",
      body,
    },
    body,
  };
}

function createUploadMock(
  outcome: "uploaded" | "reused" = "uploaded",
): UploadOtelMedia {
  return vi.fn().mockResolvedValue({ mediaId: MEDIA_ID, outcome });
}

async function processTargets(
  targets: OtelMediaTarget[],
  uploadMedia: UploadOtelMedia = createUploadMock(),
) {
  return processOtelMedia({
    targets,
    projectId: "project-id",
    mediaBucket: "media-bucket",
    mediaPrefix: "media/",
    uploadMedia,
  });
}

describe("processOtelMedia", () => {
  it("uploads a normalized observation Data URI and replaces it after success", async () => {
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
    const { target, body } = createTarget({
      value: dataUri,
      observationId: SPAN_ID,
    });
    const uploadMedia = createUploadMock();

    const result = await processTargets([target], uploadMedia);

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
      { path: "data_uri" },
    );
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.ingestion.otel.media.detection_check_byte_length",
      Buffer.byteLength(dataUri, "utf8"),
      { path: "data_uri" },
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

  it("links media to a normalized trace without an observation id", async () => {
    const { target, body } = createTarget({
      value: `data:image/png;base64,${PNG_BASE64}`,
    });
    const uploadMedia = createUploadMock();

    await processTargets([target], uploadMedia);

    expect(uploadMedia).toHaveBeenCalledWith(
      expect.objectContaining({ observationId: undefined }),
    );
    expect(body.input).toBe(MEDIA_REFERENCE);
  });

  it("processes only the explicit normalized field target", async () => {
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
    const body = { input: "plain", unrelated: dataUri };
    const uploadMedia = createUploadMock();

    await processTargets(
      [
        {
          traceId: TRACE_ID,
          observationId: SPAN_ID,
          field: "input",
          body,
        },
      ],
      uploadMedia,
    );

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(body).toEqual({ input: "plain", unrelated: dataUri });
  });

  it("replaces an embedded Data URI in a normalized string", async () => {
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
    const { target, body } = createTarget({
      value: `image: ${dataUri}`,
      observationId: SPAN_ID,
    });

    await processTargets([target]);

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
      const { target } = createTarget({ value, observationId: SPAN_ID });
      const uploadMedia = createUploadMock();

      const result = await processTargets([target], uploadMedia);

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
    const { target, body } = createTarget({
      value: JSON.stringify([
        { type: "base64", media_type: "image/png", data: PNG_BASE64 },
      ]),
      observationId: SPAN_ID,
    });

    const result = await processTargets([target]);

    expect(JSON.parse(body.input as string)[0].data).toBe(
      `@@@langfuseMedia:type=image/png|id=${MEDIA_ID}|source=bytes@@@`,
    );
    expect(result.detectionChecks.stringified_json).toBe(1);
  });

  it("uploads once when dual normalized representations contain the same media", async () => {
    const value = `data:image/png;base64,${PNG_BASE64}`;
    const first = createTarget({ value, observationId: SPAN_ID });
    const second = createTarget({ value, observationId: SPAN_ID });
    const uploadMedia = createUploadMock();

    const result = await processTargets(
      [first.target, second.target],
      uploadMedia,
    );

    expect(uploadMedia).toHaveBeenCalledTimes(1);
    expect(first.body.input).toBe(MEDIA_REFERENCE);
    expect(second.body.input).toBe(MEDIA_REFERENCE);
    expect(result.candidates).toBe(1);
    expect(result.detectionChecks.data_uri).toBe(2);
  });

  it("leaves normalized values unchanged when upload fails", async () => {
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
    const { target, body } = createTarget({
      value: dataUri,
      observationId: SPAN_ID,
    });
    const uploadMedia = vi.fn().mockRejectedValue(new Error("upload failed"));

    await processTargets([target], uploadMedia);

    expect(body.input).toBe(dataUri);
  });

  it("ignores existing media references", async () => {
    const reference =
      "@@@langfuseMedia:type=image/png|id=existing|source=bytes@@@";
    const { target, body } = createTarget({
      value: reference,
      observationId: SPAN_ID,
    });
    const uploadMedia = createUploadMock();

    await processTargets([target], uploadMedia);

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(body.input).toBe(reference);
  });

  it.each([
    ["an unsupported media type", "data:application/x-test;base64,dGVzdA=="],
    ["invalid base64", "data:image/png;base64,%%%"],
  ])("leaves %s unchanged", async (_, value) => {
    const { target, body } = createTarget({
      value,
      observationId: SPAN_ID,
    });
    const uploadMedia = createUploadMock();

    const result = await processTargets([target], uploadMedia);

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(body.input).toBe(value);
    expect(result.invalid).toBe(1);
  });
});
