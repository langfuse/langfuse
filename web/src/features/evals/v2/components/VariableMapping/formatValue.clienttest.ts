import { describe, expect, it } from "vitest";

import {
  objectEntriesForPreview,
  previewOf,
  typeBadge,
} from "@/src/features/evals/v2/components/VariableMapping/formatValue";

describe("variable mapping value previews", () => {
  it("uses a friendly label when no sample value is available", () => {
    expect(previewOf(undefined)).toBe("No sample value available");
    expect(typeBadge(undefined)).toBe("no value");
  });

  it("bounds object rows and serialized subtree previews", () => {
    const value = Object.fromEntries(
      Array.from({ length: 60 }, (_, index) => [
        `field-${index}`,
        "x".repeat(100),
      ]),
    );

    const { entries, remaining } = objectEntriesForPreview(value);

    expect(entries).toHaveLength(50);
    expect(remaining).toBe(10);
    expect(previewOf(value).length).toBeLessThanOrEqual(701);
  });
});
