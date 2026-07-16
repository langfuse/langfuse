import { describe, expect, it, vi } from "vitest";

vi.mock("../instrumentation", () => ({
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
}));
vi.mock("../logger", () => ({
  logger: { warn: vi.fn() },
}));

import type { ResourceSpan } from "./OtelIngestionProcessor";
import { processOtelMedia, type UploadOtelMedia } from "./OtelMediaProcessor";

const TRACE_ID = "0123456789abcdef0123456789abcdef";
const SPAN_ID = "0123456789abcdef";
const MEDIA_ID = "test-media-id";
const PNG_BYTES = Buffer.from("test-image");
const PNG_BASE64 = PNG_BYTES.toString("base64");

function resourceSpans(params: {
  attributeKey?: string;
  value?: string;
  eventAttributeKey?: string;
  eventValue?: string;
}): ResourceSpan[] {
  const attributes =
    params.attributeKey && params.value
      ? [
          {
            key: params.attributeKey,
            value: { stringValue: params.value },
          },
        ]
      : [];
  const events =
    params.eventAttributeKey && params.eventValue
      ? [
          {
            name: "gen_ai.client.inference.operation.details",
            attributes: [
              {
                key: params.eventAttributeKey,
                value: { stringValue: params.eventValue },
              },
            ],
          },
        ]
      : [];

  return [
    {
      scopeSpans: [
        {
          scope: { name: "test" },
          spans: [
            {
              traceId: TRACE_ID,
              spanId: SPAN_ID,
              name: "test-span",
              kind: 1,
              attributes,
              events,
            },
          ],
        },
      ],
    },
  ] as ResourceSpan[];
}

function getAttributeValue(spans: ResourceSpan[]): string {
  return spans[0]!.scopeSpans![0]!.spans![0]!.attributes![0]!.value.stringValue;
}

function getEventAttributeValue(spans: ResourceSpan[]): string {
  return spans[0]!.scopeSpans![0]!.spans![0]!.events![0]!.attributes![0]!.value
    .stringValue;
}

function createUploadMock(
  outcome: "uploaded" | "reused" = "uploaded",
): UploadOtelMedia {
  return vi.fn().mockResolvedValue({ mediaId: MEDIA_ID, outcome });
}

describe("processOtelMedia", () => {
  it("uploads a direct data URI and replaces it only after success", async () => {
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
    const spans = resourceSpans({
      attributeKey: "langfuse.observation.input",
      value: dataUri,
    });
    const uploadMedia = createUploadMock();

    await processOtelMedia({
      resourceSpans: spans,
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      uploadMedia,
    });

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
    expect(getAttributeValue(spans)).toBe(
      `@@@langfuseMedia:type=image/png|id=${MEDIA_ID}|source=base64_data_uri@@@`,
    );
  });

  it.each([
    "langfuse.trace.metadata",
    "langfuse.observation.metadata",
    "langfuse.metadata.image",
    "ai.telemetry.metadata.image",
  ])("uploads media from the metadata attribute %s", async (attributeKey) => {
    const spans = resourceSpans({
      attributeKey,
      value: `data:image/png;base64,${PNG_BASE64}`,
    });
    const uploadMedia = createUploadMock();

    await processOtelMedia({
      resourceSpans: spans,
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      uploadMedia,
    });

    expect(uploadMedia).toHaveBeenCalledWith(
      expect.objectContaining({ field: "metadata" }),
    );
  });

  it("does not inspect unrelated attributes", async () => {
    const value = `data:image/png;base64,${PNG_BASE64}`;
    const spans = resourceSpans({
      attributeKey: "unrelated.attribute",
      value,
    });
    const uploadMedia = createUploadMock();

    await processOtelMedia({
      resourceSpans: spans,
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      uploadMedia,
    });

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(getAttributeValue(spans)).toBe(value);
  });

  it("replaces an embedded data URI in an arbitrary string", async () => {
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
    const spans = resourceSpans({
      attributeKey: "gen_ai.prompt",
      value: `image: ${dataUri}`,
    });

    await processOtelMedia({
      resourceSpans: spans,
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      uploadMedia: createUploadMock(),
    });

    expect(getAttributeValue(spans)).toBe(
      `image: @@@langfuseMedia:type=image/png|id=${MEDIA_ID}|source=base64_data_uri@@@`,
    );
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
  ])("processes %s serialized media", async (_, mediaValue, referencePath) => {
    const spans = resourceSpans({
      attributeKey: "gen_ai.input.messages",
      value: JSON.stringify([mediaValue]),
    });
    const uploadMedia = createUploadMock();

    await processOtelMedia({
      resourceSpans: spans,
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      uploadMedia,
    });

    const parsed = JSON.parse(getAttributeValue(spans));
    const path = referencePath.split(".");
    const reference = path.reduce(
      (value, key) => value[key],
      parsed[0],
    ) as string;

    expect(reference).toBe(
      `@@@langfuseMedia:type=image/png|id=${MEDIA_ID}|source=bytes@@@`,
    );
    expect(uploadMedia).toHaveBeenCalledTimes(1);
  });

  it("processes media in span-event attributes", async () => {
    const spans = resourceSpans({
      eventAttributeKey: "gen_ai.output.messages",
      eventValue: `data:image/png;base64,${PNG_BASE64}`,
    });
    const uploadMedia = createUploadMock();

    await processOtelMedia({
      resourceSpans: spans,
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      uploadMedia,
    });

    expect(uploadMedia).toHaveBeenCalledWith(
      expect.objectContaining({ field: "output" }),
    );
    expect(getEventAttributeValue(spans)).toContain(
      "@@@langfuseMedia:type=image/png",
    );
  });

  it("leaves the original value unchanged when upload fails", async () => {
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
    const spans = resourceSpans({
      attributeKey: "langfuse.observation.input",
      value: dataUri,
    });
    const uploadMedia = vi.fn().mockRejectedValue(new Error("upload failed"));

    await processOtelMedia({
      resourceSpans: spans,
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      uploadMedia,
    });

    expect(getAttributeValue(spans)).toBe(dataUri);
  });

  it("ignores existing media references", async () => {
    const reference =
      "@@@langfuseMedia:type=image/png|id=existing|source=bytes@@@";
    const spans = resourceSpans({
      attributeKey: "langfuse.observation.input",
      value: reference,
    });
    const uploadMedia = createUploadMock();

    await processOtelMedia({
      resourceSpans: spans,
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      uploadMedia,
    });

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(getAttributeValue(spans)).toBe(reference);
  });

  it.each([
    ["an unsupported media type", "data:application/x-test;base64,dGVzdA=="],
    ["invalid base64", "data:image/png;base64,%%%"],
  ])("leaves %s unchanged", async (_, value) => {
    const spans = resourceSpans({
      attributeKey: "langfuse.observation.input",
      value,
    });
    const uploadMedia = createUploadMock();

    const result = await processOtelMedia({
      resourceSpans: spans,
      projectId: "project-id",
      mediaBucket: "media-bucket",
      mediaPrefix: "media/",
      uploadMedia,
    });

    expect(uploadMedia).not.toHaveBeenCalled();
    expect(getAttributeValue(spans)).toBe(value);
    expect(result.invalid).toBe(1);
  });
});
