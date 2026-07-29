import { describe, expect, it, vi } from "vitest";

import { OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE } from "../../domain/observation-field-overflow";
import { replaceOversizedObservationFieldsWithMedia } from "./ObservationFieldOverflowProcessor";

const mediaReference = (id: string) =>
  `@@@langfuseMedia:type=text/plain|id=${id}|source=${OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE}@@@`;

describe("replaceOversizedObservationFieldsWithMedia", () => {
  it("replaces oversized input and individual metadata values", async () => {
    const oversizedInput = "x".repeat(200);
    const oversizedMetadata = { nested: "y".repeat(200) };
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ mediaId: "input-media", outcome: "uploaded" })
      .mockResolvedValueOnce({
        mediaId: "metadata-media",
        outcome: "uploaded",
      });

    const result = await replaceOversizedObservationFieldsWithMedia({
      fields: {
        input: oversizedInput,
        output: "ok",
        metadata: {
          small: "keep-me",
          large: oversizedMetadata,
        },
      },
      maxFieldBytes: 10,
      upload,
    });

    expect(result.fields).toEqual({
      input: mediaReference("input-media"),
      output: "ok",
      metadata: {
        small: "keep-me",
        large: mediaReference("metadata-media"),
      },
    });
    expect(upload).toHaveBeenNthCalledWith(1, {
      field: "input",
      contentBytes: Buffer.from(oversizedInput),
    });
    expect(upload).toHaveBeenNthCalledWith(2, {
      field: "metadata",
      contentBytes: Buffer.from(JSON.stringify(oversizedMetadata)),
    });
    expect(result.outcomes).toEqual([
      {
        field: "input",
        outcome: "uploaded",
        bytesRemoved:
          Buffer.byteLength(oversizedInput) -
          Buffer.byteLength(mediaReference("input-media")),
      },
      {
        field: "metadata",
        outcome: "uploaded",
        bytesRemoved:
          Buffer.byteLength(JSON.stringify(oversizedMetadata)) -
          Buffer.byteLength(mediaReference("metadata-media")),
      },
    ]);
  });

  it("measures UTF-8 bytes and keeps values at the exact threshold", async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ mediaId: "media", outcome: "uploaded" });

    const result = await replaceOversizedObservationFieldsWithMedia({
      fields: {
        input: "🔥",
        output: "🔥a",
      },
      maxFieldBytes: 4,
      upload,
    });

    expect(result.fields.input).toBe("🔥");
    expect(result.fields.output).toBe(mediaReference("media"));
    expect(upload).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledWith({
      field: "output",
      contentBytes: Buffer.from("🔥a"),
    });
  });

  it("does not cap metadata by aggregate object size", async () => {
    const upload = vi.fn();
    const metadata = {
      first: "123456",
      second: "123456",
    };

    const result = await replaceOversizedObservationFieldsWithMedia({
      fields: { metadata },
      maxFieldBytes: 6,
      upload,
    });

    expect(result.fields.metadata).toEqual(metadata);
    expect(upload).not.toHaveBeenCalled();
  });

  it("does not allocate content buffers for fields within the limit", async () => {
    const bufferFrom = vi.spyOn(Buffer, "from");

    try {
      await replaceOversizedObservationFieldsWithMedia({
        fields: {
          input: "small-input",
          output: "small-output",
          metadata: ["small-metadata"],
        },
        maxFieldBytes: 100,
        upload: vi.fn(),
      });

      expect(bufferFrom).not.toHaveBeenCalled();
    } finally {
      bufferFrom.mockRestore();
    }
  });

  it("preserves metadata array order and duplicate-name values", async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ mediaId: "metadata-media", outcome: "uploaded" });

    const result = await replaceOversizedObservationFieldsWithMedia({
      fields: { metadata: ["keep-first", "replace-this-value", "keep-last"] },
      maxFieldBytes: 10,
      upload,
    });

    expect(result.fields.metadata).toEqual([
      "keep-first",
      mediaReference("metadata-media"),
      "keep-last",
    ]);
    expect(upload).toHaveBeenCalledOnce();
  });

  it("fails open per field and reports upload errors", async () => {
    const error = new Error("S3 unavailable");
    const onUploadError = vi.fn();

    const result = await replaceOversizedObservationFieldsWithMedia({
      fields: {
        input: "input-too-large",
        output: "output-too-large",
      },
      maxFieldBytes: 10,
      upload: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ mediaId: "output-media", outcome: "reused" }),
      onUploadError,
    });

    expect(result.fields.input).toBe("input-too-large");
    expect(result.fields.output).toBe(mediaReference("output-media"));
    expect(result.outcomes).toEqual([
      {
        field: "input",
        outcome: "failed",
        bytesRemoved: 0,
      },
      {
        field: "output",
        outcome: "reused",
        bytesRemoved: 0,
      },
    ]);
    expect(onUploadError).toHaveBeenCalledWith({
      error,
      field: "input",
      originalBytes: 15,
    });
  });

  it("defaults the per-field limit to 2 MiB", async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ mediaId: "media", outcome: "uploaded" });
    const exactLimit = "x".repeat(2 * 1024 * 1024);
    const overLimit = `${exactLimit}x`;

    const result = await replaceOversizedObservationFieldsWithMedia({
      fields: {
        input: exactLimit,
        output: overLimit,
      },
      upload,
    });

    expect(result.fields.input).toBe(exactLimit);
    expect(result.fields.output).toBe(mediaReference("media"));
    expect(upload).toHaveBeenCalledOnce();
  });
});
