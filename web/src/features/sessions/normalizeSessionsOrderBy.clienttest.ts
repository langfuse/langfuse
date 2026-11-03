import { describe, expect, it } from "vitest";

import { normalizeSessionsOrderBy } from "@/src/features/sessions/normalizeSessionsOrderBy";

describe("normalizeSessionsOrderBy", () => {
  it("maps leaked traces/events latency onto sessionDuration", () => {
    expect(
      normalizeSessionsOrderBy({ column: "latency", order: "DESC" }),
    ).toEqual({ column: "sessionDuration", order: "DESC" });
  });

  it("maps leaked observation timestamps onto createdAt", () => {
    expect(
      normalizeSessionsOrderBy({ column: "startTime", order: "ASC" }),
    ).toEqual({ column: "createdAt", order: "ASC" });
  });

  it("keeps session-native columns", () => {
    expect(
      normalizeSessionsOrderBy({ column: "totalCost", order: "DESC" }),
    ).toEqual({ column: "totalCost", order: "DESC" });
  });
});
