import { describe, it, expect } from "vitest";
import { resolveBlobExportTuning } from "./blob-export-tuning";

describe("resolveBlobExportTuning", () => {
  it("defaults to rawPassthrough=false for null/undefined", () => {
    expect(resolveBlobExportTuning(null)).toEqual({
      resolved: { rawPassthrough: false, gzipLevel: undefined },
      warnings: [],
    });
    expect(resolveBlobExportTuning(undefined)).toEqual({
      resolved: { rawPassthrough: false, gzipLevel: undefined },
      warnings: [],
    });
  });

  it("honors rawPassthrough=true", () => {
    expect(resolveBlobExportTuning({ rawPassthrough: true })).toEqual({
      resolved: { rawPassthrough: true, gzipLevel: undefined },
      warnings: [],
    });
  });

  it("honors rawPassthrough=false explicitly", () => {
    expect(resolveBlobExportTuning({ rawPassthrough: false })).toEqual({
      resolved: { rawPassthrough: false, gzipLevel: undefined },
      warnings: [],
    });
  });

  it("defaults rawPassthrough when the key is absent from a valid object", () => {
    expect(resolveBlobExportTuning({})).toEqual({
      resolved: { rawPassthrough: false, gzipLevel: undefined },
      warnings: [],
    });
  });

  it("ignores unknown keys (forward-compat with LFE-10394 knobs)", () => {
    const result = resolveBlobExportTuning({
      rawPassthrough: true,
      partSizeBytes: 200,
      maxConcurrentParts: 8,
      skipEnrichment: true,
    });
    expect(result.resolved).toEqual({
      rawPassthrough: true,
      gzipLevel: undefined,
    });
    expect(result.warnings).toEqual([]);
  });

  it("falls back to defaults and warns on a wrong-typed rawPassthrough", () => {
    const result = resolveBlobExportTuning({ rawPassthrough: "yes" });
    expect(result.resolved).toEqual({
      rawPassthrough: false,
      gzipLevel: undefined,
    });
    expect(result.warnings.length).toBe(1);
  });

  it("falls back to defaults and warns on a non-object column", () => {
    const result = resolveBlobExportTuning("garbage");
    expect(result.resolved).toEqual({
      rawPassthrough: false,
      gzipLevel: undefined,
    });
    expect(result.warnings.length).toBe(1);
  });

  it("honors a valid gzipLevel and keeps rawPassthrough independent", () => {
    expect(
      resolveBlobExportTuning({ rawPassthrough: true, gzipLevel: 1 }),
    ).toEqual({
      resolved: { rawPassthrough: true, gzipLevel: 1 },
      warnings: [],
    });
    // level 0 (store) is valid
    expect(resolveBlobExportTuning({ gzipLevel: 0 })).toEqual({
      resolved: { rawPassthrough: false, gzipLevel: 0 },
      warnings: [],
    });
    expect(resolveBlobExportTuning({ gzipLevel: 9 })).toEqual({
      resolved: { rawPassthrough: false, gzipLevel: 9 },
      warnings: [],
    });
  });

  it("clamps an out-of-range gzipLevel to default without disabling rawPassthrough", () => {
    const tooHigh = resolveBlobExportTuning({
      rawPassthrough: true,
      gzipLevel: 12,
    });
    expect(tooHigh.resolved).toEqual({
      rawPassthrough: true,
      gzipLevel: undefined,
    });
    expect(tooHigh.warnings.length).toBe(1);

    const negative = resolveBlobExportTuning({ gzipLevel: -1 });
    expect(negative.resolved.gzipLevel).toBeUndefined();
    expect(negative.warnings.length).toBe(1);

    const fractional = resolveBlobExportTuning({ gzipLevel: 3.5 });
    expect(fractional.resolved.gzipLevel).toBeUndefined();
    expect(fractional.warnings.length).toBe(1);
  });

  it("never throws", () => {
    expect(() => resolveBlobExportTuning(12345)).not.toThrow();
    expect(() => resolveBlobExportTuning([])).not.toThrow();
  });
});
