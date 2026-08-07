import { describe, expect, it } from "vitest";

import { pathSegmentsToJsonPath } from "./jsonExpansionUtils";

describe("pathSegmentsToJsonPath", () => {
  it("escapes quotes and backslashes in bracket-quoted keys", () => {
    expect(pathSegmentsToJsonPath(['settings\\\"theme'])).toBe(
      '$["settings\\\\\\"theme"]',
    );
  });
});
