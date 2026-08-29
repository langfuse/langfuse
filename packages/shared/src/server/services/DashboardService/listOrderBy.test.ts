import { describe, expect, it } from "vitest";
import { InvalidRequestError } from "../../../errors";
import {
  toDashboardPrismaOrderBy,
  toDashboardWidgetPrismaOrderBy,
} from "./listOrderBy";

describe("toDashboardPrismaOrderBy", () => {
  it("rejects a traces startTime orderBy leaked via the shared URL param", () => {
    expect(() =>
      toDashboardPrismaOrderBy({ column: "startTime", order: "DESC" }),
    ).toThrow(InvalidRequestError);
  });

  it("maps dashboard list columns to Prisma orderBy", () => {
    expect(toDashboardPrismaOrderBy({ column: "name", order: "ASC" })).toEqual([
      { name: "asc" },
    ]);
    expect(
      toDashboardPrismaOrderBy({ column: "createdAt", order: "DESC" }),
    ).toEqual([{ createdAt: "desc" }]);
    expect(
      toDashboardPrismaOrderBy({ column: "updatedAt", order: "ASC" }),
    ).toEqual([{ updatedAt: "asc" }]);
  });

  it("defaults to updatedAt desc when orderBy is missing", () => {
    expect(toDashboardPrismaOrderBy(null)).toEqual([{ updatedAt: "desc" }]);
    expect(toDashboardPrismaOrderBy(undefined)).toEqual([
      { updatedAt: "desc" },
    ]);
  });
});

describe("toDashboardWidgetPrismaOrderBy", () => {
  it("rejects a traces startTime orderBy leaked via the shared URL param", () => {
    expect(() =>
      toDashboardWidgetPrismaOrderBy({ column: "startTime", order: "DESC" }),
    ).toThrow(InvalidRequestError);
  });

  it("maps widget list columns including view and chartType", () => {
    expect(
      toDashboardWidgetPrismaOrderBy({ column: "view", order: "ASC" }),
    ).toEqual([{ view: "asc" }]);
    expect(
      toDashboardWidgetPrismaOrderBy({ column: "chartType", order: "DESC" }),
    ).toEqual([{ chartType: "desc" }]);
  });
});
