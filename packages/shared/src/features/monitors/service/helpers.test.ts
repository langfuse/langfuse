import { MonitorView as PrismaMonitorView, Prisma } from "@prisma/client";
import { describe, it, expect } from "vitest";
import { z } from "zod";

import { InvalidRequestError, LangfuseNotFoundError } from "../../../errors";
import { singleFilter } from "../../../interfaces/filters";
import { MonitorViewSchema, MonitorWindowSchema } from "../types";
import { DAY, HOUR, MINUTE, WEEK } from "../helpers";
import {
  calculateCadence,
  calculateSchedulerBatchId,
  decimalToPrisma,
  errorFromPrisma,
  monitorFromPrisma,
  sortFiltersCanonically,
  toPrismaWhere,
  updateSchedulerProperties,
  updateStatusAndSeverity,
  viewFromPrisma,
  viewToPrisma,
  windowFromMs,
  windowToMs,
} from "./helpers";
import { type ListMonitorFilter } from "./types";

type Filter = z.infer<typeof singleFilter>;

const stringFilter = (column: string, value: string): Filter => ({
  column,
  operator: "=",
  value,
  type: "string",
});

const stringOptionsFilter = (column: string, value: string[]): Filter => ({
  column,
  operator: "any of",
  value,
  type: "stringOptions",
});

describe("sortFiltersCanonically", () => {
  it("returns a new array sorted by column", () => {
    const input: Filter[] = [
      stringFilter("env", "production"),
      stringFilter("app", "faq-bot"),
    ];
    const sorted = sortFiltersCanonically(input);

    expect(sorted.map((f) => f.column)).toEqual(["app", "env"]);
    // does not mutate the original
    expect(input.map((f) => f.column)).toEqual(["env", "app"]);
  });

  it("breaks column ties by operator", () => {
    const input: Filter[] = [
      { column: "env", operator: ">=", value: 10, type: "number" },
      { column: "env", operator: "=", value: 10, type: "number" },
    ];
    const sorted = sortFiltersCanonically(input);
    expect(sorted.map((f) => f.operator)).toEqual(["=", ">="]);
  });

  it("breaks column+operator ties by stringified value", () => {
    const input: Filter[] = [
      stringOptionsFilter("env", ["staging", "production"]),
      stringOptionsFilter("env", ["dev"]),
    ];
    const sorted = sortFiltersCanonically(input);
    // JSON.stringify(["dev"]) < JSON.stringify(["staging","production"])
    expect(sorted[0].value).toEqual(["dev"]);
  });

  it("sorts the value array for set-semantics operators", () => {
    // `stringOptions` / `categoryOptions` / `arrayOptions` all use the
    // `any of` / `none of` / `all of` operators over a `string[]` value, and
    // element order is semantically irrelevant — must canonicalize the array
    // so equivalent filters hash the same.
    const input: Filter[] = [
      stringOptionsFilter("env", ["staging", "production", "dev"]),
    ];
    const sorted = sortFiltersCanonically(input);
    expect(sorted[0].value as string[]).toEqual([
      "dev",
      "production",
      "staging",
    ]);
  });

  it("breaks column+operator ties by `key` for stringObject filters", () => {
    // Two metadata filters with the same operator and value but different
    // keys must canonicalize on `key` — otherwise filters that scope to
    // different metadata properties collide in the canonical sequence.
    const input: Filter[] = [
      {
        type: "stringObject",
        column: "metadata",
        key: "tenant",
        operator: "=",
        value: "acme",
      },
      {
        type: "stringObject",
        column: "metadata",
        key: "env",
        operator: "=",
        value: "acme",
      },
    ];
    const sorted = sortFiltersCanonically(input);
    expect((sorted[0] as { key: string }).key).toBe("env");
    expect((sorted[1] as { key: string }).key).toBe("tenant");
  });

  it("is idempotent", () => {
    const input: Filter[] = [
      stringFilter("env", "production"),
      stringFilter("app", "faq-bot"),
    ];
    const once = sortFiltersCanonically(input);
    const twice = sortFiltersCanonically(once);
    expect(twice).toEqual(once);
  });
});

describe("toPrismaWhere", () => {
  it("scopes by projectId with no AND clauses for undefined or empty filter", () => {
    expect(toPrismaWhere("proj_01", undefined)).toEqual({
      projectId: "proj_01",
      AND: [],
    });
    expect(toPrismaWhere("proj_01", [])).toEqual({
      projectId: "proj_01",
      AND: [],
    });
  });

  it("translates severity `any of` into a Prisma `in` clause", () => {
    const filter: ListMonitorFilter = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["ALERT", "WARNING"],
      },
    ];
    expect(toPrismaWhere("proj_01", filter)).toEqual({
      projectId: "proj_01",
      AND: [{ severity: { in: ["ALERT", "WARNING"] } }],
    });
  });

  it("translates severity `none of` into a negated `in` clause", () => {
    const filter: ListMonitorFilter = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "none of",
        value: ["PAUSED"],
      },
    ];
    expect(toPrismaWhere("proj_01", filter)).toEqual({
      projectId: "proj_01",
      AND: [{ NOT: { severity: { in: ["PAUSED"] } } }],
    });
  });

  it("translates tags operators to Prisma array predicates", () => {
    const filter: ListMonitorFilter = [
      {
        type: "arrayOptions",
        column: "tags",
        operator: "any of",
        value: ["prod"],
      },
      {
        type: "arrayOptions",
        column: "tags",
        operator: "all of",
        value: ["prod", "latency"],
      },
      {
        type: "arrayOptions",
        column: "tags",
        operator: "none of",
        value: ["legacy"],
      },
    ];
    expect(toPrismaWhere("proj_01", filter)).toEqual({
      projectId: "proj_01",
      AND: [
        { tags: { hasSome: ["prod"] } },
        { tags: { hasEvery: ["prod", "latency"] } },
        { NOT: { tags: { hasSome: ["legacy"] } } },
      ],
    });
  });

  it("skips empty tag-value rows", () => {
    const filter: ListMonitorFilter = [
      {
        type: "arrayOptions",
        column: "tags",
        operator: "all of",
        value: [],
      },
      {
        type: "arrayOptions",
        column: "tags",
        operator: "none of",
        value: [],
      },
    ];
    expect(toPrismaWhere("proj_01", filter)).toEqual({
      projectId: "proj_01",
      AND: [],
    });
  });
});

describe("calculateCadence", () => {
  it("returns 1 minute for sub-day windows", () => {
    expect(calculateCadence(5n * 60_000n)).toBe(MINUTE);
    expect(calculateCadence(4n * 60n * 60_000n)).toBe(MINUTE);
    expect(calculateCadence(DAY - 1n)).toBe(MINUTE);
  });

  it("returns 30 minutes for day-to-week windows", () => {
    expect(calculateCadence(24n * 60n * 60_000n)).toBe(30n * MINUTE);
    expect(calculateCadence(DAY + 1n)).toBe(30n * MINUTE);
    expect(calculateCadence(2n * 24n * 60n * 60_000n)).toBe(30n * MINUTE);
    expect(calculateCadence(WEEK - 1n)).toBe(30n * MINUTE);
  });

  it("returns 48 hours for week-and-up windows", () => {
    expect(calculateCadence(7n * 24n * 60n * 60_000n)).toBe(48n * HOUR);
    expect(calculateCadence(WEEK + 1n)).toBe(48n * HOUR);
  });
});

describe("calculateSchedulerBatchId", () => {
  const base = {
    projectId: "proj_01",
    view: "observations" as const,
    filters: [
      stringFilter("env", "production"),
      stringFilter("app", "faq-bot"),
    ],
    windowMs: 5n * 60_000n,
  };

  it("is deterministic across calls", () => {
    expect(calculateSchedulerBatchId(base)).toBe(
      calculateSchedulerBatchId(base),
    );
  });

  it("is filter-order-insensitive", () => {
    const reordered = {
      ...base,
      filters: [...base.filters].reverse(),
    };
    expect(calculateSchedulerBatchId(reordered)).toBe(
      calculateSchedulerBatchId(base),
    );
  });

  it("is permutation-invariant for set-semantics value arrays", () => {
    // `stringOptions` (and its siblings) carry a set as `value` — element
    // order does not change which rows match, so two filters that pick the
    // same options in different orders MUST produce the same
    // schedulerBatchId. Otherwise the worker batching optimization
    // fragments on logically-identical multi-select filters.
    const a = calculateSchedulerBatchId({
      ...base,
      filters: [stringOptionsFilter("env", ["prod", "staging"])],
    });
    const b = calculateSchedulerBatchId({
      ...base,
      filters: [stringOptionsFilter("env", ["staging", "prod"])],
    });
    expect(a).toBe(b);
  });

  it("is permutation-invariant for filters that differ only in `key`", () => {
    // Two metadata.* filters with the same (column, operator, value) but
    // different keys MUST canonicalize to the same sequence regardless of
    // input order; otherwise the schedulerBatchId is not a stable
    // fingerprint of the query shape.
    const metaTenant: Filter = {
      type: "stringObject",
      column: "metadata",
      key: "tenant",
      operator: "=",
      value: "acme",
    };
    const metaEnv: Filter = {
      type: "stringObject",
      column: "metadata",
      key: "env",
      operator: "=",
      value: "acme",
    };
    const a = calculateSchedulerBatchId({
      ...base,
      filters: [metaTenant, metaEnv],
    });
    const b = calculateSchedulerBatchId({
      ...base,
      filters: [metaEnv, metaTenant],
    });
    expect(a).toBe(b);
  });

  it("hashes equally for a metadata filter parsed from inputs with different property orders", () => {
    // Zod `.parse` rebuilds the object in schema-declared property order, so
    // two raw inputs with the same content but different property orders
    // produce identical canonical filters and identical hashes.
    const canonical = singleFilter.parse({
      type: "stringObject",
      column: "metadata",
      key: "env",
      operator: "=",
      value: "prod",
    });
    const reordered = singleFilter.parse({
      value: "prod",
      operator: "=",
      key: "env",
      column: "metadata",
      type: "stringObject",
    });
    const a = calculateSchedulerBatchId({ ...base, filters: [canonical] });
    const b = calculateSchedulerBatchId({ ...base, filters: [reordered] });
    expect(a).toBe(b);
  });

  it("hashes equally for a set-semantics filter parsed from inputs with reordered value arrays", () => {
    // The set-semantics canonicalization in `sortFiltersCanonically` sorts
    // the value array, so a parsed filter with reordered `value` elements
    // hashes the same as its canonically-ordered counterpart.
    const canonical = singleFilter.parse({
      type: "stringOptions",
      column: "env",
      operator: "any of",
      value: ["prod", "staging"],
    });
    const reordered = singleFilter.parse({
      type: "stringOptions",
      column: "env",
      operator: "any of",
      value: ["staging", "prod"],
    });
    const a = calculateSchedulerBatchId({ ...base, filters: [canonical] });
    const b = calculateSchedulerBatchId({ ...base, filters: [reordered] });
    expect(a).toBe(b);
  });

  it("changes when projectId changes", () => {
    expect(
      calculateSchedulerBatchId({ ...base, projectId: "proj_02" }),
    ).not.toBe(calculateSchedulerBatchId(base));
  });

  it("changes when view changes", () => {
    expect(
      calculateSchedulerBatchId({ ...base, view: "scores-numeric" }),
    ).not.toBe(calculateSchedulerBatchId(base));
  });

  it("changes when window changes", () => {
    expect(
      calculateSchedulerBatchId({
        ...base,
        windowMs: 60n * 60_000n,
      }),
    ).not.toBe(calculateSchedulerBatchId(base));
  });

  it("changes when a filter value changes", () => {
    expect(
      calculateSchedulerBatchId({
        ...base,
        filters: [stringFilter("env", "staging"), ...base.filters.slice(1)],
      }),
    ).not.toBe(calculateSchedulerBatchId(base));
  });

  it("returns a nonneg i63 (fits Postgres BIGINT)", () => {
    for (const view of [
      "observations",
      "scores-numeric",
      "scores-categorical",
    ] as const) {
      const id = calculateSchedulerBatchId({ ...base, view });
      expect(id >= 0n).toBe(true);
      expect(id < 1n << 63n).toBe(true);
    }
  });
});

describe("windowToMs / windowFromMs", () => {
  it.each(MonitorWindowSchema.options)("round-trips %s", (window) => {
    expect(windowFromMs(windowToMs(window))).toBe(window);
  });

  it("throws InvalidRequestError on a bigint that isn't a known tier", () => {
    expect(() => windowFromMs(123n)).toThrow(InvalidRequestError);
  });
});

describe("viewToPrisma / viewFromPrisma", () => {
  it.each(MonitorViewSchema.options)("round-trips %s", (view) => {
    expect(viewFromPrisma(viewToPrisma(view))).toBe(view);
  });

  it.each(Object.values(PrismaMonitorView))("round-trips Prisma %s", (view) => {
    expect(viewToPrisma(viewFromPrisma(view))).toBe(view);
  });
});

describe("decimalToPrisma", () => {
  it("returns null for a null input", () => {
    expect(decimalToPrisma(null)).toBeNull();
  });

  it("wraps a finite number as Prisma.Decimal", () => {
    const out = decimalToPrisma(42);
    expect(out).toBeInstanceOf(Prisma.Decimal);
    expect((out as Prisma.Decimal).toNumber()).toBe(42);
  });
});

describe("errorFromPrisma", () => {
  it("maps P2025 (row not found) to LangfuseNotFoundError", () => {
    const e = new Prisma.PrismaClientKnownRequestError("not found", {
      code: "P2025",
      clientVersion: "test",
    });
    const mapped = errorFromPrisma("mon_01", "proj_01", e);
    expect(mapped).toBeInstanceOf(LangfuseNotFoundError);
    expect(mapped.message).toContain("mon_01");
    expect(mapped.message).toContain("proj_01");
  });

  it("passes through other Prisma errors unchanged", () => {
    const e = new Prisma.PrismaClientKnownRequestError("oops", {
      code: "P2002",
      clientVersion: "test",
    });
    expect(errorFromPrisma("mon_01", "proj_01", e)).toBe(e);
  });

  it("passes through non-Prisma errors unchanged", () => {
    const e = new Error("boom");
    expect(errorFromPrisma("mon_01", "proj_01", e)).toBe(e);
  });
});

describe("monitorFromPrisma", () => {
  // The shape of a Prisma `Monitor` row, post-fetch. The mapper translates
  // enums, unwraps Decimals, and re-emits the API-shaped `window` string.
  const prismaRow = {
    id: "mon_01",
    createdAt: new Date("2026-05-18T00:00:00.000Z"),
    updatedAt: new Date("2026-05-18T00:00:00.000Z"),
    createdBy: null,
    updatedBy: null,
    projectId: "proj_01",
    view: PrismaMonitorView.OBSERVATIONS,
    filters: [],
    metric: { measure: "count", aggregation: "count" },
    windowMs: 5n * 60_000n,
    cadenceMs: 60_000n,
    schedulerBatchId: 42n,
    thresholdOperator: "GT" as const,
    alertThreshold: new Prisma.Decimal(100),
    warningThreshold: null,
    noData: { mode: "SILENT" as const },
    renotify: { mode: "OFF" as const },
    severity: "UNKNOWN" as const,
    severityChangedAt: null,
    alertedAt: null,
    status: "ACTIVE" as const,
    nextRunAt: new Date("2026-05-18T00:01:00.000Z"),
    lastPublishedAt: null,
    lastClaimedAt: null,
    lastCompletedAt: null,
    name: "High error rate",
    tags: [] as string[],
    triggerIds: [] as string[],
  };

  it("translates a representative row to the domain shape", () => {
    const monitor = monitorFromPrisma(prismaRow);
    expect(monitor.view).toBe("observations");
    expect(monitor.status).toBe("ACTIVE");
    expect(monitor.severity).toBe("UNKNOWN");
    expect(monitor.thresholdOperator).toBe("GT");
    expect(monitor.window).toBe("5m");
    expect(monitor.alertThreshold).toBe(100);
    expect(monitor.warningThreshold).toBeNull();
  });

  it("unwraps a Decimal warningThreshold", () => {
    const monitor = monitorFromPrisma({
      ...prismaRow,
      warningThreshold: new Prisma.Decimal(50),
    });
    expect(monitor.warningThreshold).toBe(50);
  });

  it("throws when windowMs doesn't match a tier", () => {
    expect(() =>
      monitorFromPrisma({ ...prismaRow, windowMs: 7n * 60_000n }),
    ).toThrow(InvalidRequestError);
  });
});

describe("updateStatusAndSeverity", () => {
  it("emits PAUSED with a timestamp when status leaves ACTIVE", () => {
    const result = updateStatusAndSeverity("ACTIVE", "PAUSED");
    expect(result.status).toBe("PAUSED");
    expect(result.severity).toBe("PAUSED");
    expect(result.severityChangedAt).toBeInstanceOf(Date);
  });

  it("emits UNKNOWN with a timestamp when status returns to ACTIVE", () => {
    const result = updateStatusAndSeverity("PAUSED", "ACTIVE");
    expect(result.status).toBe("ACTIVE");
    expect(result.severity).toBe("UNKNOWN");
    expect(result.severityChangedAt).toBeInstanceOf(Date);
  });

  it("resets the publish lifecycle stamps when status returns to ACTIVE", () => {
    const result = updateStatusAndSeverity("PAUSED", "ACTIVE");
    expect(result.nextRunAt).toBeNull();
    expect(result.lastPublishedAt).toBeNull();
    expect(result.lastCompletedAt).toBeNull();
    expect(result.lastClaimedAt).toBeNull();
    expect(result.alertedAt).toBeNull();
  });

  it("emits UNKNOWN when recovering from ERROR_BAD_QUERY to ACTIVE", () => {
    const result = updateStatusAndSeverity("ERROR_BAD_QUERY", "ACTIVE");
    expect(result.status).toBe("ACTIVE");
    expect(result.severity).toBe("UNKNOWN");
    expect(result.severityChangedAt).toBeInstanceOf(Date);
  });

  it("emits PAUSED when going from ACTIVE to ERROR_BAD_QUERY", () => {
    const result = updateStatusAndSeverity("ACTIVE", "ERROR_BAD_QUERY");
    expect(result.status).toBe("ERROR_BAD_QUERY");
    expect(result.severity).toBe("PAUSED");
    expect(result.severityChangedAt).toBeInstanceOf(Date);
  });

  it("writes only status when it does not change", () => {
    expect(updateStatusAndSeverity("ACTIVE", "ACTIVE")).toEqual({
      status: "ACTIVE",
    });
    expect(updateStatusAndSeverity("PAUSED", "PAUSED")).toEqual({
      status: "PAUSED",
    });
  });

  it("writes only status when transitioning between two non-ACTIVE states", () => {
    expect(updateStatusAndSeverity("PAUSED", "ERROR_BAD_QUERY")).toEqual({
      status: "ERROR_BAD_QUERY",
    });
    expect(updateStatusAndSeverity("ERROR_BAD_QUERY", "PAUSED")).toEqual({
      status: "PAUSED",
    });
  });
});

describe("updateSchedulerProperties", () => {
  it("resets the publish lifecycle stamps when the batch id changes", () => {
    expect(updateSchedulerProperties(1n, 2n)).toEqual({
      schedulerBatchId: 2n,
      nextRunAt: null,
      lastPublishedAt: null,
      lastCompletedAt: null,
      lastClaimedAt: null,
    });
  });

  it("is a no-op when the batch id is unchanged", () => {
    expect(updateSchedulerProperties(42n, 42n)).toEqual({});
  });
});
