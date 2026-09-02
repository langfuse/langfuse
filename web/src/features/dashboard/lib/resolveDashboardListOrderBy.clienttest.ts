import { describe, expect, it } from "vitest";
import {
  resolveDashboardListOrderBy,
  resolveWidgetListOrderBy,
} from "./resolveDashboardListOrderBy";

describe("resolveDashboardListOrderBy", () => {
  it("keeps dashboard list columns", () => {
    expect(
      resolveDashboardListOrderBy({ column: "name", order: "ASC" }),
    ).toEqual({ column: "name", order: "ASC" });
    expect(
      resolveDashboardListOrderBy({ column: "createdAt", order: "DESC" }),
    ).toEqual({ column: "createdAt", order: "DESC" });
  });

  it("drops a traces startTime leftover from the shared URL param", () => {
    expect(
      resolveDashboardListOrderBy({ column: "startTime", order: "DESC" }),
    ).toEqual({ column: "updatedAt", order: "DESC" });
  });

  it("defaults when orderBy is missing", () => {
    expect(resolveDashboardListOrderBy(null)).toEqual({
      column: "updatedAt",
      order: "DESC",
    });
  });
});

describe("resolveWidgetListOrderBy", () => {
  it("keeps widget view and chartType sorts", () => {
    expect(resolveWidgetListOrderBy({ column: "view", order: "ASC" })).toEqual({
      column: "view",
      order: "ASC",
    });
    expect(
      resolveWidgetListOrderBy({ column: "chartType", order: "DESC" }),
    ).toEqual({ column: "chartType", order: "DESC" });
  });

  it("drops a traces startTime leftover from the shared URL param", () => {
    expect(
      resolveWidgetListOrderBy({ column: "startTime", order: "DESC" }),
    ).toEqual({ column: "updatedAt", order: "DESC" });
  });
});
