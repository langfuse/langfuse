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

    expect(transformed).toBe(value);
    expect(processCandidate).not.toHaveBeenCalled();
    expect(onInvalidCandidate).not.toHaveBeenCalled();
    expect(onDetectionPath).not.toHaveBeenCalled();
  });

  it("scans adversarial repeated data prefixes without a regular expression", async () => {
    const processCandidate = vi.fn().mockResolvedValue(MEDIA_REFERENCE);
    const onDetectionPath = vi.fn();
    const value = `${"data:".repeat(10_000)}data:image/png;base64,${PNG_BASE64}`;

    const transformed = await transformMediaPayload(value, {
      processCandidate,
      onInvalidCandidate: vi.fn(),
      onDetectionPath,
    });

    expect(transformed).toBe(`${"data:".repeat(10_000)}${MEDIA_REFERENCE}`);
    expect(processCandidate).toHaveBeenCalledTimes(1);
    expect(onDetectionPath).toHaveBeenCalledOnce();
    expect(onDetectionPath).toHaveBeenCalledWith("data_uri");
  });

  it("uploads identical embedded data URIs only once", async () => {
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

    expect(transformed).toBe(`${MEDIA_REFERENCE} between ${MEDIA_REFERENCE}`);
    expect(processCandidate).toHaveBeenCalledTimes(1);
    expect(onDetectionPath).toHaveBeenCalledOnce();
    expect(onDetectionPath).toHaveBeenCalledWith("data_uri");
  });

  it("reports checks of shape-based stringified JSON", async () => {
    const onDetectionPath = vi.fn();

    await transformMediaPayload(
      JSON.stringify({
        type: "base64",
        media_type: "image/png",
        data: PNG_BASE64,
      }),
      {
        processCandidate: vi.fn().mockResolvedValue(MEDIA_REFERENCE),
        onInvalidCandidate: vi.fn(),
        onDetectionPath,
      },
    );

    expect(onDetectionPath).toHaveBeenCalledOnce();
    expect(onDetectionPath).toHaveBeenCalledWith("stringified_json");
  });
});
