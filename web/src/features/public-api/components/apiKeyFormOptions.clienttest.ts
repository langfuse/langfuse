import { describe, expect, it } from "vitest";

import { resolveExpiresAt } from "./apiKeyFormOptions";

describe("resolveExpiresAt", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("returns null when the key never expires", () => {
    expect(resolveExpiresAt("never", "", now)).toBeNull();
  });

  it("offsets a preset by its day count from now", () => {
    expect(resolveExpiresAt("30d", "", now)).toEqual(
      new Date("2026-01-31T00:00:00.000Z"),
    );
    expect(resolveExpiresAt("1y", "", now)).toEqual(
      new Date("2027-01-01T00:00:00.000Z"),
    );
  });

  it("parses a custom date and rejects an empty or invalid one", () => {
    expect(resolveExpiresAt("custom", "2026-06-15", now)).toEqual(
      new Date("2026-06-15"),
    );
    expect(resolveExpiresAt("custom", "", now)).toBeNull();
    expect(resolveExpiresAt("custom", "not-a-date", now)).toBeNull();
  });
});
