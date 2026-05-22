import { describe, expect, it } from "vitest";
import { safeS3ObjectKeySegment } from "./processEventBatch";

describe("safeS3ObjectKeySegment", () => {
  it("returns safe segments unchanged", () => {
    expect(safeS3ObjectKeySegment("time-12-54-37-476491_resp_abc123")).toBe(
      "time-12-54-37-476491_resp_abc123",
    );
  });

  it("sanitizes unsupported characters and appends a stable hash suffix", () => {
    const raw = "resp_bGl0ZWxsbTphYmM+Lz0=";
    const safe = safeS3ObjectKeySegment(raw);

    expect(safe).not.toContain("+");
    expect(safe).not.toContain("/");
    expect(safe).not.toContain("=");
    expect(safe).toMatch(/_[0-9a-f]{16}$/);
    expect(Buffer.byteLength(safe)).toBeLessThanOrEqual(255);

    // Stable
    expect(safeS3ObjectKeySegment(raw)).toBe(safe);
  });

  it("bounds long segments to the S3/minio per-segment limit", () => {
    const raw = `resp_${"a".repeat(400)}`;
    const safe = safeS3ObjectKeySegment(raw);

    expect(Buffer.byteLength(safe)).toBeLessThanOrEqual(255);
    expect(safe).toMatch(/_[0-9a-f]{16}$/);
  });
});
