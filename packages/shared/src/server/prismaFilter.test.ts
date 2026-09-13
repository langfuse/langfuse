import { describe, expect, it } from "vitest";
import type { FilterState } from "../types";
import {
  compilePrismaFilters,
  stringFilterToPrisma,
  stringOptionsFilterToPrisma,
  type PrismaFilterColumnHandlers,
} from "./prismaFilter";

type TestWhere = {
  name?: unknown;
  status?: unknown;
};

describe("compilePrismaFilters", () => {
  const handlers = {
    name: {
      string: (filter) => ({ name: stringFilterToPrisma(filter) }),
      stringOptions: (filter) => ({
        name: stringOptionsFilterToPrisma(filter),
      }),
    },
    status: {
      stringOptions: (filter) => ({ status: { in: filter.value } }),
    },
  } satisfies Record<string, PrismaFilterColumnHandlers<TestWhere>>;

  it("compiles validated filters through explicit column handlers", () => {
    const filters: FilterState = [
      {
        column: "name",
        type: "string",
        operator: "does not contain",
        value: "draft",
      },
      {
        column: "status",
        type: "stringOptions",
        operator: "any of",
        value: ["ACTIVE"],
      },
    ];

    expect(compilePrismaFilters<TestWhere>(filters, handlers)).toEqual([
      {
        name: {
          not: { contains: "draft", mode: "insensitive" },
        },
      },
      { status: { in: ["ACTIVE"] } },
    ]);
  });

  it("compiles selector inclusions and exclusions", () => {
    expect(
      stringOptionsFilterToPrisma({
        column: "name",
        type: "stringOptions",
        operator: "none of",
        value: ["Archived", "Draft"],
      }),
    ).toEqual({
      notIn: ["Archived", "Draft"],
      mode: "insensitive",
    });
  });

  it("rejects filters without an explicit handler", () => {
    expect(() =>
      compilePrismaFilters<TestWhere>(
        [
          {
            column: "unknown",
            type: "string",
            operator: "contains",
            value: "value",
          },
        ],
        handlers,
      ),
    ).toThrow("Unsupported Prisma filter: unknown (string)");
  });
});
