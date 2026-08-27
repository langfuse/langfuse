import { describe, it, expect } from "vitest";

import {
  resolveBlobExportTuning,
  BlobExportTuningSchema,
  BLOB_EXPORT_TUNING_BOUNDS,
  DEFAULT_BLOB_EXPORT_PART_SIZE_BYTES,
  type BlobExportTuningDefaults,
  type ResolvedBlobExportTuning,
} from "./blob-export-tuning";

const DEFAULTS: BlobExportTuningDefaults = {
  partSizeBytes: DEFAULT_BLOB_EXPORT_PART_SIZE_BYTES, // 100 MiB
};

// Fully-resolved object with the defaults applied; override per assertion.
// Concurrency/attempts default to undefined (operator did not set them) so the
// backend keeps its native default.
function resolved(
  overrides: Partial<ResolvedBlobExportTuning> = {},
): ResolvedBlobExportTuning {
  return {
    rawPassthrough: false,
    gzipLevel: undefined,
    partSizeBytes: DEFAULTS.partSizeBytes,
    maxConcurrentParts: undefined,
    maxPartAttempts: undefined,
    skipEnrichment: false,
    ...overrides,
  };
}

describe("resolveBlobExportTuning", () => {
  describe("null / absent / malformed → defaults, byte-for-byte unchanged", () => {
    it("returns defaults with no warnings for null", () => {
      expect(resolveBlobExportTuning(null, DEFAULTS)).toEqual({
        resolved: resolved(),
        warnings: [],
      });
    });

    it("returns defaults with no warnings for undefined", () => {
      expect(resolveBlobExportTuning(undefined, DEFAULTS)).toEqual({
        resolved: resolved(),
        warnings: [],
      });
    });

    it("returns defaults with no warnings for an empty object", () => {
      expect(resolveBlobExportTuning({}, DEFAULTS)).toEqual({
        resolved: resolved(),
        warnings: [],
      });
    });

    it("warns and uses defaults when the value is not an object", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        "garbage",
        DEFAULTS,
      );
      expect(res).toEqual(resolved());
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("expected an object");
    });

    it("warns and uses defaults for an array (objects only)", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        [1, 2],
        DEFAULTS,
      );
      expect(res).toEqual(resolved());
      expect(warnings[0]).toContain("expected an object");
    });
  });

  describe("rawPassthrough (LFE-10402)", () => {
    it("honors rawPassthrough=true", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        { rawPassthrough: true },
        DEFAULTS,
      );
      expect(res).toEqual(resolved({ rawPassthrough: true }));
      expect(warnings).toEqual([]);
    });

    it("honors rawPassthrough=false explicitly", () => {
      const { resolved: res } = resolveBlobExportTuning(
        { rawPassthrough: false },
        DEFAULTS,
      );
      expect(res.rawPassthrough).toBe(false);
    });

    it("falls back to false and warns on a wrong-typed rawPassthrough", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        { rawPassthrough: "yes" },
        DEFAULTS,
      );
      expect(res.rawPassthrough).toBe(false);
      expect(warnings.some((w) => w.includes("expected a boolean"))).toBe(true);
    });

    it("composes rawPassthrough with upload knobs", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        {
          rawPassthrough: true,
          partSizeBytes: 200 * 1024 * 1024,
          maxConcurrentParts: 8,
          skipEnrichment: true,
        },
        DEFAULTS,
      );
      expect(res).toEqual(
        resolved({
          rawPassthrough: true,
          partSizeBytes: 200 * 1024 * 1024,
          maxConcurrentParts: 8,
          skipEnrichment: true,
        }),
      );
      expect(warnings).toEqual([]);
    });
  });

  describe("gzipLevel (LFE-10402)", () => {
    it("honors a valid gzipLevel independently of rawPassthrough", () => {
      expect(
        resolveBlobExportTuning(
          { rawPassthrough: true, gzipLevel: 1 },
          DEFAULTS,
        ).resolved,
      ).toEqual(resolved({ rawPassthrough: true, gzipLevel: 1 }));
      // level 0 (store) and 9 (max) are both valid
      expect(
        resolveBlobExportTuning({ gzipLevel: 0 }, DEFAULTS).resolved.gzipLevel,
      ).toBe(0);
      expect(
        resolveBlobExportTuning({ gzipLevel: 9 }, DEFAULTS).resolved.gzipLevel,
      ).toBe(9);
    });

    it("drops an out-of-range gzipLevel to the zlib default without disabling rawPassthrough", () => {
      const tooHigh = resolveBlobExportTuning(
        { rawPassthrough: true, gzipLevel: 12 },
        DEFAULTS,
      );
      expect(tooHigh.resolved.rawPassthrough).toBe(true);
      expect(tooHigh.resolved.gzipLevel).toBeUndefined();
      expect(
        tooHigh.warnings.some((w) => w.includes("out of range [0, 9]")),
      ).toBe(true);

      expect(
        resolveBlobExportTuning({ gzipLevel: -1 }, DEFAULTS).resolved.gzipLevel,
      ).toBeUndefined();
    });

    it("reports gzipLevel failure modes with accurate, distinct messages", () => {
      // non-integer in range → "not an integer", NOT "out of range"
      const frac = resolveBlobExportTuning({ gzipLevel: 5.5 }, DEFAULTS);
      expect(frac.resolved.gzipLevel).toBeUndefined();
      expect(frac.warnings.some((w) => w.includes("is not an integer"))).toBe(
        true,
      );
      expect(frac.warnings.some((w) => w.includes("out of range"))).toBe(false);

      // wrong type → "expected a finite number", NOT "out of range"
      const str = resolveBlobExportTuning({ gzipLevel: "high" }, DEFAULTS);
      expect(str.resolved.gzipLevel).toBeUndefined();
      expect(
        str.warnings.some((w) => w.includes("expected a finite number")),
      ).toBe(true);
      expect(str.warnings.some((w) => w.includes("out of range"))).toBe(false);
    });
  });

  describe("valid in-range upload knobs are honoured silently", () => {
    it("passes through values within bounds", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        {
          partSizeBytes: 200 * 1024 * 1024,
          maxConcurrentParts: 16,
          maxPartAttempts: 5,
          skipEnrichment: true,
        },
        DEFAULTS,
      );
      expect(res).toEqual(
        resolved({
          partSizeBytes: 200 * 1024 * 1024,
          maxConcurrentParts: 16,
          maxPartAttempts: 5,
          skipEnrichment: true,
        }),
      );
      expect(warnings).toEqual([]);
    });
  });

  describe("out-of-range numbers are clamped (not defaulted) and warned", () => {
    it("clamps maxConcurrentParts above the ceiling to 32", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        { maxConcurrentParts: 50 },
        DEFAULTS,
      );
      expect(res.maxConcurrentParts).toBe(
        BLOB_EXPORT_TUNING_BOUNDS.maxConcurrentParts.max,
      );
      expect(warnings.some((w) => w.includes("clamped to 32"))).toBe(true);
    });

    it("clamps maxConcurrentParts below the floor to 1", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        { maxConcurrentParts: 0 },
        DEFAULTS,
      );
      expect(res.maxConcurrentParts).toBe(1);
      expect(warnings.some((w) => w.includes("clamped to 1"))).toBe(true);
    });

    it("clamps maxPartAttempts above 10 to 10", () => {
      const { resolved: res } = resolveBlobExportTuning(
        { maxPartAttempts: 99 },
        DEFAULTS,
      );
      expect(res.maxPartAttempts).toBe(10);
    });

    it("clamps partSizeBytes below 5 MiB to the floor", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        { partSizeBytes: 1024 },
        DEFAULTS,
      );
      expect(res.partSizeBytes).toBe(
        BLOB_EXPORT_TUNING_BOUNDS.partSizeBytes.min,
      );
      expect(warnings.some((w) => w.includes("clamped"))).toBe(true);
    });

    it("clamps partSizeBytes above 5 GiB to the ceiling", () => {
      const { resolved: res } = resolveBlobExportTuning(
        { partSizeBytes: 9 * 1024 * 1024 * 1024 },
        DEFAULTS,
      );
      expect(res.partSizeBytes).toBe(
        BLOB_EXPORT_TUNING_BOUNDS.partSizeBytes.max,
      );
    });
  });

  describe("in-range non-integers are rounded, not reported as out of range", () => {
    it("rounds an in-range float and warns about rounding only", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        { maxConcurrentParts: 3.5 },
        DEFAULTS,
      );
      expect(res.maxConcurrentParts).toBe(4);
      expect(warnings.some((w) => w.includes("rounded to 4"))).toBe(true);
      // Must NOT claim the in-range value was out of range.
      expect(warnings.some((w) => w.includes("out of range"))).toBe(false);
    });

    it("reports both rounding and clamping for an out-of-range float", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        { maxConcurrentParts: 41.6 },
        DEFAULTS,
      );
      expect(res.maxConcurrentParts).toBe(32);
      expect(warnings.some((w) => w.includes("rounded to 42"))).toBe(true);
      expect(warnings.some((w) => w.includes("clamped to 32"))).toBe(true);
    });
  });

  describe("wrong-typed / non-finite values fall back to defaults and warn", () => {
    it("falls back to undefined (backend default) when a concurrency knob is a string", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        { maxConcurrentParts: "x" },
        DEFAULTS,
      );
      expect(res.maxConcurrentParts).toBeUndefined();
      expect(warnings.some((w) => w.includes("expected a finite number"))).toBe(
        true,
      );
    });

    it("falls back to the partSize default when partSizeBytes is NaN", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        { partSizeBytes: NaN },
        DEFAULTS,
      );
      expect(res.partSizeBytes).toBe(DEFAULTS.partSizeBytes);
      expect(warnings.some((w) => w.includes("expected a finite number"))).toBe(
        true,
      );
    });

    it("falls back to false when skipEnrichment is not a boolean", () => {
      const { resolved: res, warnings } = resolveBlobExportTuning(
        { skipEnrichment: "yes" },
        DEFAULTS,
      );
      expect(res.skipEnrichment).toBe(false);
      expect(warnings.some((w) => w.includes("expected a boolean"))).toBe(true);
    });
  });

  it("never throws across a range of hostile inputs", () => {
    const inputs: unknown[] = [
      0,
      "",
      true,
      [],
      12345,
      { partSizeBytes: -1, maxConcurrentParts: Infinity },
      { skipEnrichment: 1, maxPartAttempts: {} },
      { rawPassthrough: [], gzipLevel: "x" },
      Symbol("x") as unknown,
    ];
    for (const input of inputs) {
      expect(() => resolveBlobExportTuning(input, DEFAULTS)).not.toThrow();
    }
  });
});

describe("BlobExportTuningSchema (write schema)", () => {
  it("accepts an in-range partial object", () => {
    expect(
      BlobExportTuningSchema.safeParse({ maxConcurrentParts: 10 }).success,
    ).toBe(true);
  });

  it("accepts rawPassthrough and gzipLevel", () => {
    expect(
      BlobExportTuningSchema.safeParse({ rawPassthrough: true, gzipLevel: 6 })
        .success,
    ).toBe(true);
  });

  it("rejects out-of-range values (writes reject; reads clamp)", () => {
    expect(
      BlobExportTuningSchema.safeParse({ maxConcurrentParts: 50 }).success,
    ).toBe(false);
    expect(BlobExportTuningSchema.safeParse({ gzipLevel: 12 }).success).toBe(
      false,
    );
  });

  it("strips unknown keys (forward-compat, not strict)", () => {
    const parsed = BlobExportTuningSchema.safeParse({ bogus: 1 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("bogus");
    }
  });
});
