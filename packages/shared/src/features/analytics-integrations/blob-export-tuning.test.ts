import { describe, it, expect } from "vitest";
import { resolveBlobExportTuning } from "./blob-export-tuning";

describe("resolveBlobExportTuning", () => {
  it("defaults to rawPassthrough=false for null/undefined", () => {
    expect(resolveBlobExportTuning(null)).toEqual({
      resolved: { rawPassthrough: false },
      warnings: [],
    });
    expect(resolveBlobExportTuning(undefined)).toEqual({
      resolved: { rawPassthrough: false },
      warnings: [],
    });
  });

  it("honors rawPassthrough=true", () => {
    expect(resolveBlobExportTuning({ rawPassthrough: true })).toEqual({
      resolved: { rawPassthrough: true },
      warnings: [],
    });
  });

  it("honors rawPassthrough=false explicitly", () => {
    expect(resolveBlobExportTuning({ rawPassthrough: false })).toEqual({
      resolved: { rawPassthrough: false },
      warnings: [],
    });
  });

  it("defaults rawPassthrough when the key is absent from a valid object", () => {
    expect(resolveBlobExportTuning({})).toEqual({
      resolved: { rawPassthrough: false },
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
    expect(result.resolved).toEqual({ rawPassthrough: true });
    expect(result.warnings).toEqual([]);
  });

  it("falls back to defaults and warns on a wrong-typed rawPassthrough", () => {
    const result = resolveBlobExportTuning({ rawPassthrough: "yes" });
    expect(result.resolved).toEqual({ rawPassthrough: false });
    expect(result.warnings.length).toBe(1);
  });

  it("falls back to defaults and warns on a non-object column", () => {
    const result = resolveBlobExportTuning("garbage");
    expect(result.resolved).toEqual({ rawPassthrough: false });
    expect(result.warnings.length).toBe(1);
  });

  it("never throws", () => {
    expect(() => resolveBlobExportTuning(12345)).not.toThrow();
    expect(() => resolveBlobExportTuning([])).not.toThrow();
  });
});
