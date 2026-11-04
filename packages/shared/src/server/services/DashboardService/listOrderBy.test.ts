import { describe, expect, it } from "vitest";
import {
  toDashboardPrismaOrderBy,
  toDashboardWidgetPrismaOrderBy,
} from "./listOrderBy";

describe("toDashboardWidgetPrismaOrderBy", () => {
  it("maps Display Mode onto updatedAt instead of interpolating a missing Prisma field", () => {
    expect(
      toDashboardWidgetPrismaOrderBy({
        column: "displayMode",
        order: "DESC",
      }),
    ).toEqual([{ updatedAt: "desc" }]);
  });

  it("maps a leaked traces startTime onto updatedAt", () => {
    expect(
      toDashboardWidgetPrismaOrderBy({
        column: "startTime",
        order: "ASC",
      }),
    ).toEqual([{ updatedAt: "asc" }]);
  });

  it("keeps real DashboardWidget columns", () => {
    expect(
      toDashboardWidgetPrismaOrderBy({ column: "view", order: "ASC" }),
    ).toEqual([{ view: "asc" }]);
    expect(
      toDashboardWidgetPrismaOrderBy({
        column: "chartType",
        order: "DESC",
      }),
    ).toEqual([{ chartType: "desc" }]);
  });

  it("defaults to updatedAt desc when orderBy is missing", () => {
    expect(toDashboardWidgetPrismaOrderBy(undefined)).toEqual([
      { updatedAt: "desc" },
    ]);
  });
});

describe("toDashboardPrismaOrderBy", () => {
  it("maps a leaked traces startTime onto updatedAt", () => {
    expect(
      toDashboardPrismaOrderBy({ column: "startTime", order: "DESC" }),
    ).toEqual([{ updatedAt: "desc" }]);
  });

  it("keeps real Dashboard columns", () => {
    expect(toDashboardPrismaOrderBy({ column: "name", order: "ASC" })).toEqual([
      { name: "asc" },
    ]);
  });
});
