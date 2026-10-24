import { describe, expect, it } from "vitest";

import { normalizeFilterColumnIdentifier } from "./useFilterState";

describe("normalizeFilterColumnIdentifier", () => {
  it("normalizes casing and common separators in filter column identifiers", () => {
    expect(normalizeFilterColumnIdentifier("Trace-Name")).toBe("tracename");
    expect(normalizeFilterColumnIdentifier("session id")).toBe("sessionid");
    expect(normalizeFilterColumnIdentifier("USER_ID")).toBe("userid");
  });
});
