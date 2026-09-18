import { describe, expect, it } from "vitest";

import { safeBlobFilenameStem, safeBlobKeySegment } from "./safeBlobKeySegment";
import { env } from "../../env";

describe("safeBlobKeySegment", () => {
  it("returns already-safe segments unchanged", () => {
    expect(safeBlobKeySegment("time-12-54-37-476491_resp_abc123")).toBe(
      "time-12-54-37-476491_resp_abc123",
    );
  });

  it("replaces path separators and appends a stable hash suffix", () => {
    const raw = "resp_bGl0ZWxsbTphYmM+Lz0=/child";
    const safe = safeBlobKeySegment(raw, 255);

    expect(safe).not.toContain("/");
    expect(safe).not.toContain("\\");
    expect(safe).toMatch(/_[0-9a-f]{16}$/);
    expect(Buffer.byteLength(safe, "utf8")).toBeLessThanOrEqual(255);

    expect(safeBlobKeySegment(raw, 255)).toBe(safe);
  });

  it("bounds long segments to the configured per-segment byte limit", () => {
    const raw = `resp_${"a".repeat(400)}`;
    const safe = safeBlobKeySegment(raw, 255);

    expect(Buffer.byteLength(safe, "utf8")).toBeLessThanOrEqual(255);
    expect(safe).toMatch(/_[0-9a-f]{16}$/);
  });

  it("does not split multi-byte characters when truncating", () => {
    const raw = `resp_${"測".repeat(400)}`;
    const safe = safeBlobKeySegment(raw, 255);

    expect(Buffer.byteLength(safe, "utf8")).toBeLessThanOrEqual(255);
    expect(safe).toMatch(/_[0-9a-f]{16}$/);
    expect(safe).not.toContain("\uFFFD");
  });

  it("reserves filename suffix bytes when sanitizing event file stems", () => {
    const budget = env.LANGFUSE_S3_EVENT_KEY_MAX_SEGMENT_BYTES;
    const safeStem = safeBlobFilenameStem(
      `${"a".repeat(budget + 10)}/child`,
      ".json",
    );
    const fileName = `${safeStem}.json`;

    expect(safeStem).not.toContain("/");
    expect(Buffer.byteLength(fileName, "utf8")).toBeLessThanOrEqual(budget);
  });
});
