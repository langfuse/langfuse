import { describe, expect, it, vi } from "vitest";

import { OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE } from "../../domain/observation-field-spill";
import { spillOversizedObservationFields } from "./ObservationFieldSpillProcessor";

const mediaReference = (id: string) =>
  `@@@langfuseMedia:type=text/plain|id=${id}|source=${OBSERVATION_FIELD_SIZE_LIMIT_MEDIA_SOURCE}@@@`;

describe("spillOversizedObservationFields", () => {
  it("spills oversized input and individual metadata values", async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ mediaId: "input-media", outcome: "uploaded" })
      .mockResolvedValueOnce({
        mediaId: "metadata-media",
        outcome: "uploaded",
      });

    const result = await spillOversizedObservationFields({
      fields: {
        input: "input-too-large",
        output: "ok",
        metadata: {
          small: "keep-me",
          large: { nested: "metadata-too-large" },
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
      contentBytes: Buffer.from("input-too-large"),
    });
    expect(upload).toHaveBeenNthCalledWith(2, {
      field: "metadata",
      contentBytes: Buffer.from('{"nested":"metadata-too-large"}'),
    });
    expect(result.outcomes).toEqual([
      {
        field: "input",
        outcome: "uploaded",
        originalBytes: 15,
        persistedBytes: expect.any(Number),
      },
      {
        field: "metadata",
        outcome: "uploaded",
        originalBytes: 31,
        persistedBytes: expect.any(Number),
      },
    ]);
  });

  it("measures UTF-8 bytes and keeps values at the exact threshold", async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ mediaId: "media", outcome: "uploaded" });

    const result = await spillOversizedObservationFields({
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

    const result = await spillOversizedObservationFields({
      fields: { metadata },
      maxFieldBytes: 6,
      upload,
    });

    expect(result.fields.metadata).toEqual(metadata);
    expect(upload).not.toHaveBeenCalled();
  });

  it("preserves metadata array order and duplicate-name values", async () => {
    const upload = vi
      .fn()
      .mockResolvedValue({ mediaId: "metadata-media", outcome: "uploaded" });

    const result = await spillOversizedObservationFields({
      fields: { metadata: ["keep-first", "spill-this-value", "keep-last"] },
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

    const result = await spillOversizedObservationFields({
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
        originalBytes: 15,
        persistedBytes: 15,
      },
      {
        field: "output",
        outcome: "reused",
        originalBytes: 16,
        persistedBytes: expect.any(Number),
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

    const result = await spillOversizedObservationFields({
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
