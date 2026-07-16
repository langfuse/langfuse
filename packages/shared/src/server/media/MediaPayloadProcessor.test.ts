import { describe, expect, it, vi } from "vitest";

import { transformMediaPayload } from "./MediaPayloadProcessor";

const PNG_BASE64 = Buffer.from("test-image").toString("base64");
const MEDIA_REFERENCE =
  "@@@langfuseMedia:type=image/png|id=test-media-id|source=base64_data_uri@@@";

describe("transformMediaPayload", () => {
  it("scans adversarial repeated data prefixes without a regular expression", async () => {
    const processCandidate = vi.fn().mockResolvedValue(MEDIA_REFERENCE);
    const value = `${"data:".repeat(10_000)}data:image/png;base64,${PNG_BASE64}`;

    const transformed = await transformMediaPayload(value, {
      processCandidate,
      onInvalidCandidate: vi.fn(),
    });

    expect(transformed).toBe(`${"data:".repeat(10_000)}${MEDIA_REFERENCE}`);
    expect(processCandidate).toHaveBeenCalledTimes(1);
  });

  it("uploads identical embedded data URIs only once", async () => {
    const processCandidate = vi.fn().mockResolvedValue(MEDIA_REFERENCE);
    const dataUri = `data:image/png;base64,${PNG_BASE64}`;

    const transformed = await transformMediaPayload(
      `${dataUri} between ${dataUri}`,
      {
        processCandidate,
        onInvalidCandidate: vi.fn(),
      },
    );

    expect(transformed).toBe(`${MEDIA_REFERENCE} between ${MEDIA_REFERENCE}`);
    expect(processCandidate).toHaveBeenCalledTimes(1);
  });
});
