import {
  MonitorSeverity as PrismaMonitorSeverity,
  MonitorStatus as PrismaMonitorStatus,
  MonitorThresholdOperator as PrismaMonitorThresholdOperator,
  MonitorView as PrismaMonitorView,
  Prisma,
} from "@prisma/client";
import { describe, it, expect } from "vitest";
import { z } from "zod";

import { InvalidRequestError } from "../../../errors";
import { singleFilter } from "../../../interfaces/filters";
import {
  MonitorSeveritySchema,
  MonitorStatusSchema,
  MonitorThresholdOperatorSchema,
  MonitorViewSchema,
  MonitorWindowSchema,
} from "../types";
import { DAY, HOUR, MINUTE, WEEK } from "../helpers";
import {
  calculateCadence,
  calculateLastRunAt,
  calculateSchedulerBatchId,
  decimalToPrisma,
  errorFromPrisma,
  monitorFromPrisma,
  severityFromPrisma,
  sortFiltersCanonically,
  statusFromPrisma,
  statusToPrisma,
  thresholdOperatorFromPrisma,
  thresholdOperatorToPrisma,
  viewFromPrisma,
  viewToPrisma,
  windowFromMs,
  windowToMs,
} from "./helpers";

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

describe("calculateLastRunAt", () => {
  const ONE_MINUTE = 60n * 1000n;
  const THIRTY_MIN = 30n * ONE_MINUTE;
  const FORTY_EIGHT_HOURS = 48n * 60n * ONE_MINUTE;

  it("returns a Date strictly at or before now", () => {
    const now = new Date("2026-05-19T12:34:56.789Z");
    const result = calculateLastRunAt(now, ONE_MINUTE, 17n);
    expect(result.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it("places the result on the (boundary + offset) slot", () => {
    // schedulerBatchId % 60 = 17 → offset = 17_000ms
    const now = new Date("2026-05-19T12:34:56.789Z");
    const result = calculateLastRunAt(now, ONE_MINUTE, 17n);

    // result is exactly (boundary + 17s); the seconds-component is 17
    expect(result.getUTCSeconds()).toBe(17);
    expect(result.getUTCMilliseconds()).toBe(0);
  });

  it("is deterministic per (schedulerBatchId, cadence) inside one cadence", () => {
    const cadence = ONE_MINUTE;
    const batchId = 42n;

    // two `now`s within the same minute-after-offset window
    const a = calculateLastRunAt(
      new Date("2026-05-19T12:34:50.000Z"),
      cadence,
      batchId,
    );
    const b = calculateLastRunAt(
      new Date("2026-05-19T12:34:55.123Z"),
      cadence,
      batchId,
    );
    expect(a.getTime()).toBe(b.getTime());
  });

  it("computes a deterministic slot for the 30-minute cadence", () => {
    const result = calculateLastRunAt(
      new Date("2026-05-19T12:45:00.000Z"),
      THIRTY_MIN,
      45n,
    );
    // most recent boundary <= 12:45:00 with offset=45s is 12:30:45
    expect(result.toISOString()).toBe("2026-05-19T12:30:45.000Z");
  });

  it("computes a deterministic slot for the 48-hour cadence", () => {
    // epoch 0 is a 48h boundary; 48h slots align at multiples of 172_800_000ms from epoch.
    const now = new Date("2026-05-19T12:00:00.000Z");
    const result = calculateLastRunAt(now, FORTY_EIGHT_HOURS, 7n);

    const cadenceMs = Number(FORTY_EIGHT_HOURS);
    const offsetMs = 7 * 1000;
    const expected =
      Math.floor((now.getTime() - offsetMs) / cadenceMs) * cadenceMs + offsetMs;
    expect(result.getTime()).toBe(expected);
    expect(result.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it("preserves the same in-cadence offset for the same batchId across different `now`s", () => {
    // Two monitors with the same schedulerBatchId created at different `now`s
    // produce different initial lastRunAt values (off by a cadence), but each
    // is on the same `(boundary + offset)` slot — the scheduler converges them
    // by advancing each by +cadence on every tick where due.
    const cadence = ONE_MINUTE;
    const batchId = 30n;

    const a = calculateLastRunAt(
      new Date("2026-05-19T12:00:10.000Z"),
      cadence,
      batchId,
    );
    const b = calculateLastRunAt(
      new Date("2026-05-19T12:00:40.000Z"),
      cadence,
      batchId,
    );

    const cadenceMs = Number(cadence);
    const offsetMs = Number(batchId % 60n) * 1000;
    expect(a.getTime() % cadenceMs).toBe(offsetMs);
    expect(b.getTime() % cadenceMs).toBe(offsetMs);
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

describe("statusToPrisma / statusFromPrisma", () => {
  it.each(MonitorStatusSchema.options)("round-trips %s", (status) => {
    expect(statusFromPrisma(statusToPrisma(status))).toBe(status);
  });

  it.each(Object.values(PrismaMonitorStatus))(
    "round-trips Prisma %s",
    (status) => {
      expect(statusToPrisma(statusFromPrisma(status))).toBe(status);
    },
  );
});

describe("severityFromPrisma", () => {
  // No `severityToPrisma`: severity is owned by the scheduler/worker, never by
  // a caller submitting an input. Only the reverse mapping is needed.
  it.each(Object.values(PrismaMonitorSeverity))(
    "maps Prisma %s to a valid MonitorSeverity",
    (severity) => {
      const mapped = severityFromPrisma(severity);
      expect(MonitorSeveritySchema.options).toContain(mapped);
    },
  );
});

describe("thresholdOperatorToPrisma / thresholdOperatorFromPrisma", () => {
  it.each(MonitorThresholdOperatorSchema.options)("round-trips %s", (op) => {
    expect(thresholdOperatorFromPrisma(thresholdOperatorToPrisma(op))).toBe(op);
  });

  it.each(Object.values(PrismaMonitorThresholdOperator))(
    "round-trips Prisma %s",
    (op) => {
      expect(thresholdOperatorToPrisma(thresholdOperatorFromPrisma(op))).toBe(
        op,
      );
    },
  );
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
  it("maps P2025 (row not found) to InvalidRequestError", () => {
    const e = new Prisma.PrismaClientKnownRequestError("not found", {
      code: "P2025",
      clientVersion: "test",
    });
    const mapped = errorFromPrisma("mon_01", "proj_01", e);
    expect(mapped).toBeInstanceOf(InvalidRequestError);
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
    thresholdOperator: PrismaMonitorThresholdOperator.GT,
    alertThreshold: new Prisma.Decimal(100),
    warningThreshold: null,
    noData: { mode: "SILENT" as const },
    renotify: { mode: "OFF" as const },
    severity: PrismaMonitorSeverity.UNKNOWN,
    severityChangedAt: null,
    alertedAt: null,
    status: PrismaMonitorStatus.ACTIVE,
    nextRunAt: new Date("2026-05-18T00:01:00.000Z"),
    lastPublishedRunAt: null,
    lastCompletedRunAt: null,
    name: "High error rate",
    tags: [] as string[],
  };

  it("translates a representative row to the domain shape", () => {
    const monitor = monitorFromPrisma(prismaRow);
    expect(monitor.view).toBe("observations");
    expect(monitor.status).toBe("active");
    expect(monitor.severity).toBe("unknown");
    expect(monitor.thresholdOperator).toBe("gt");
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
