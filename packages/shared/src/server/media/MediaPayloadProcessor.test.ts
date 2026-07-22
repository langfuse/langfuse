import { describe, expect, it, vi } from "vitest";

import { transformMediaPayload } from "./MediaPayloadProcessor";

const PNG_BASE64 = Buffer.from("test-image").toString("base64");
const MEDIA_REFERENCE =
  "@@@langfuseMedia:type=image/png|id=test-media-id|source=base64_data_uri@@@";

describe("transformMediaPayload", () => {
  it("does not inspect ordinary text containing data prefixes", async () => {
    const processCandidate = vi.fn();
    const onInvalidCandidate = vi.fn();
    const onDetectionPath = vi.fn();
    const value = "data: is a label, not necessarily an encoded media value";

    const transformed = await transformMediaPayload(value, {
      processCandidate,
      onInvalidCandidate,
      onDetectionPath,
    });

    expect(transformed.value).toBe(value);
    expect(processCandidate).not.toHaveBeenCalled();
    expect(onInvalidCandidate).not.toHaveBeenCalled();
    expect(onDetectionPath).not.toHaveBeenCalled();
  });

  it("scans adversarial repeated data prefixes in linear time", async () => {
    const processCandidate = vi.fn().mockResolvedValue(MEDIA_REFERENCE);
    const onDetectionPath = vi.fn();
    const repeatedPrefixes = "data:".repeat(256_000);
    const value = `${repeatedPrefixes}data:image/png;base64,${PNG_BASE64}`;
    const startedAt = performance.now();

    const transformed = await transformMediaPayload(value, {
      processCandidate,
      onInvalidCandidate: vi.fn(),
      onDetectionPath,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(transformed.value).toBe(`${repeatedPrefixes}${MEDIA_REFERENCE}`);
    expect(elapsedMs).toBeLessThan(1_000);
    expect(processCandidate).toHaveBeenCalledTimes(1);
    expect(onDetectionPath).toHaveBeenCalledOnce();
    expect(onDetectionPath).toHaveBeenCalledWith(
      "data_uri",
      Buffer.byteLength(value, "utf8"),
    );
  });

  it("processes each embedded data URI occurrence independently", async () => {
    const processCandidate = vi.fn().mockResolvedValue(MEDIA_REFERENCE);
    const onDetectionPath = vi.fn();
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;

    const transformed = await transformMediaPayload(
      `${dataUri} between ${dataUri}`,
      {
        processCandidate,
        onInvalidCandidate: vi.fn(),
        onDetectionPath,
      },
    );

    expect(transformed.value).toBe(
      `${MEDIA_REFERENCE} between ${MEDIA_REFERENCE}`,
    );
    expect(processCandidate).toHaveBeenCalledTimes(2);
    expect(onDetectionPath).toHaveBeenCalledOnce();
    expect(onDetectionPath).toHaveBeenCalledWith(
      "data_uri",
      Buffer.byteLength(`${dataUri} between ${dataUri}`, "utf8"),
    );
  });

  it("processes Data URIs with media type parameters", async () => {
    const processCandidate = vi.fn().mockResolvedValue(MEDIA_REFERENCE);
    const textBase64 = Buffer.from("hello").toString("base64");
    const dataUri = `data:text/plain;charset=utf-8;base64,${textBase64}`;

    const transformed = await transformMediaPayload(`file: ${dataUri}`, {
      processCandidate,
      onInvalidCandidate: vi.fn(),
      onDetectionPath: vi.fn(),
    });

    expect(transformed.value).toBe(`file: ${MEDIA_REFERENCE}`);
    expect(processCandidate).toHaveBeenCalledWith({
      base64Data: textBase64,
      contentType: "text/plain",
      kind: "data_uri",
      source: "base64_data_uri",
    });
  });

  it("reports checks of shape-based stringified JSON", async () => {
    const onDetectionPath = vi.fn();

    await transformMediaPayload(
      JSON.stringify(
        {
          type: "base64",
          media_type: "image/png",
          data: PNG_BASE64,
        },
        null,
        2,
      ),
      {
        processCandidate: vi.fn().mockResolvedValue(MEDIA_REFERENCE),
        onInvalidCandidate: vi.fn(),
        onDetectionPath,
      },
    );

    expect(onDetectionPath).toHaveBeenCalledOnce();
    expect(onDetectionPath).toHaveBeenCalledWith(
      "stringified_json",
      expect.any(Number),
    );
  });

  it("processes Data URIs and raw base64 shapes in the same stringified JSON", async () => {
    const processCandidate = vi.fn().mockResolvedValue(MEDIA_REFERENCE);
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
    const value = JSON.stringify({
      image: dataUri,
      document: {
        type: "base64",
        media_type: "image/png",
        data: PNG_BASE64,
      },
    });

    const transformed = await transformMediaPayload(value, {
      processCandidate,
      onInvalidCandidate: vi.fn(),
      onDetectionPath: vi.fn(),
    });

    expect(JSON.parse(transformed.value as string)).toEqual({
      image: MEDIA_REFERENCE,
      document: {
        type: "base64",
        media_type: "image/png",
        data: MEDIA_REFERENCE,
      },
    });
    expect(processCandidate).toHaveBeenCalledTimes(2);
  });

  it("does not parse generic stringified JSON with data-like keys", async () => {
    const processCandidate = vi.fn();
    const onDetectionPath = vi.fn();
    const value = JSON.stringify({
      metadata: {
        type: "record",
        media_type: "report",
        data: "ordinary application data",
      },
    });

    const transformed = await transformMediaPayload(value, {
      processCandidate,
      onInvalidCandidate: vi.fn(),
      onDetectionPath,
    });

    expect(transformed.value).toBe(value);
    expect(processCandidate).not.toHaveBeenCalled();
    expect(onDetectionPath).not.toHaveBeenCalled();
  });

  it("processes structured normalized payloads without serializing them first", async () => {
    const onDetectionPath = vi.fn();
    const value = {
      messages: [{ type: "base64", media_type: "image/png", data: PNG_BASE64 }],
    };

    const transformed = await transformMediaPayload(value, {
      processCandidate: vi.fn().mockResolvedValue(MEDIA_REFERENCE),
      onInvalidCandidate: vi.fn(),
      onDetectionPath,
    });

    expect(transformed.value).toBe(value);
    expect(value.messages[0]?.data).toBe(MEDIA_REFERENCE);
    expect(onDetectionPath).toHaveBeenCalledWith(
      "structured_payload",
      Buffer.byteLength(PNG_BASE64, "utf8"),
    );
  });

  it("replaces an own __proto__ field without invoking its setter", async () => {
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;
    const value: Record<string, unknown> = {};
    const originalPrototype = Object.getPrototypeOf(value);
    Object.defineProperty(value, "__proto__", {
      configurable: true,
      enumerable: true,
      get: () => dataUri,
      set: (replacement: unknown) => {
        Object.setPrototypeOf(value, { polluted: replacement });
      },
    });

    await transformMediaPayload(value, {
      processCandidate: vi.fn().mockResolvedValue(MEDIA_REFERENCE),
      onInvalidCandidate: vi.fn(),
      onDetectionPath: vi.fn(),
    });

    expect(Object.getPrototypeOf(value)).toBe(originalPrototype);
    expect(Object.getOwnPropertyDescriptor(value, "__proto__")?.value).toBe(
      MEDIA_REFERENCE,
    );
  });

  it("replaces a structured media field without invoking its setter", async () => {
    const setter = vi.fn();
    const value: Record<string, unknown> = {
      type: "base64",
      media_type: "image/png",
    };
    Object.defineProperty(value, "data", {
      configurable: true,
      enumerable: true,
      get: () => PNG_BASE64,
      set: setter,
    });

    await transformMediaPayload(value, {
      processCandidate: vi.fn().mockResolvedValue(MEDIA_REFERENCE),
      onInvalidCandidate: vi.fn(),
      onDetectionPath: vi.fn(),
    });

    expect(setter).not.toHaveBeenCalled();
    expect(Object.getOwnPropertyDescriptor(value, "data")?.value).toBe(
      MEDIA_REFERENCE,
    );
  });
});
