import { describe, it, expect } from "vitest";
import { z } from "zod";

import {
  calculateLastRunAt,
  calculateSchedulerBatchId,
  sortFiltersCanonically,
} from "./internal";
import { type singleFilter } from "../../../interfaces/filters";

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
