import { describe, expect, it } from "vitest";

import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import type { QueryType } from "../types";
import { QueryBuilder } from "./queryBuilder";

const query: QueryType = {
  view: "billable-units",
  dimensions: [{ field: "unitType" }],
  metrics: [{ measure: "count", aggregation: "count" }],
  filters: [
    {
      column: "environment",
      type: "stringOptions",
      operator: "any of",
      value: ["production"],
    },
  ],
  timeDimension: { granularity: "hour" },
  fromTimestamp: "2026-01-07T00:00:00.000Z",
  toTimestamp: "2026-01-07T06:00:00.000Z",
  orderBy: null,
};

describe("billable-units view", () => {
  it("compiles one single-level query over the ledger on v1 and v2", async () => {
    const [v1, v2] = await Promise.all(
      (["v1", "v2"] as const).map((version) =>
        new QueryBuilder(undefined, version).build(query, "project-1"),
      ),
    );
    expect(v2).toEqual(v1);
    expect(v1.query).toMatchInlineSnapshot(
      `"select b.event_type as unitType, toStartOfHour(b.ingested_at) as time_dimension, uniq(tuple(b.event_type, b.event_id)) as count_count from billable_events as b where b.project_id = {p1:String} and b.environment in ({p2:Array(String)}) and b.ingested_at >= {p3:DateTime64(3, 'UTC')} and b.ingested_at <= {p4:DateTime64(3, 'UTC')} group by unitType, time_dimension order by time_dimension asc with fill from toStartOfHour({p3:DateTime64(3, 'UTC')}) to toStartOfHour({p4:DateTime64(3, 'UTC')}) step toIntervalHour(1)"`,
    );
    expect(v1.parameters).toMatchInlineSnapshot(`
      {
        "p1": "project-1",
        "p2": [
          "production",
        ],
        "p3": "2026-01-07 00:00:00.000",
        "p4": "2026-01-07 06:00:00.000",
      }
    `);
  });

  // The user filter is the only condition between tenancy and the time range.
  it.each<[QueryType["filters"][number], string]>([
    [
      { column: "environment", type: "null", operator: "is null", value: "" },
      "b.environment is null",
    ],
    [
      {
        column: "environment",
        type: "null",
        operator: "is not null",
        value: "",
      },
      "b.environment is not null",
    ],
    [
      {
        column: "ingested_at",
        type: "datetime",
        operator: ">=",
        value: new Date("2026-01-07T01:00:00.000Z"),
      },
      "b.ingested_at >= {p2:DateTime64(3, 'UTC')}",
    ],
    [
      {
        column: "environment",
        type: "stringOptions",
        operator: "none of",
        value: ["dev"],
      },
      "b.environment not in ({p2:Array(String)})",
    ],
    [
      { column: "unitType", type: "string", operator: "=", value: "trace" },
      "b.event_type = {p2:String}",
    ],
    [
      {
        column: "environment",
        type: "string",
        operator: "contains",
        value: "dev",
      },
      "position(b.environment, {p2:String}) > 0",
    ],
    [
      {
        column: "environment",
        type: "string",
        operator: "does not contain",
        value: "dev",
      },
      "position(b.environment, {p2:String}) = 0",
    ],
    [
      {
        column: "environment",
        type: "string",
        operator: "starts with",
        value: "dev",
      },
      "startsWith(b.environment, {p2:String})",
    ],
    [
      {
        column: "environment",
        type: "string",
        operator: "ends with",
        value: "dev",
      },
      "endsWith(b.environment, {p2:String})",
    ],
    [
      {
        column: "environment",
        type: "string",
        operator: "is not empty",
        value: "",
      },
      "(b.environment != '' and b.environment is not null)",
    ],
  ])("lowers the filter %o to %s", async (filter, where) => {
    const { query: sql } = await new QueryBuilder(undefined, "v2").build(
      { ...query, filters: [filter] },
      "project-1",
    );
    expect(sql).toContain(
      `where b.project_id = {p1:String} and ${where} and b.ingested_at >= {p`,
    );
  });

  it("counts distinct units, not ledger rows, when no metric is requested", async () => {
    const { query: sql } = await new QueryBuilder(undefined, "v2").build(
      { ...query, metrics: [] },
      "project-1",
    );
    expect(sql).toContain(
      "uniq(tuple(b.event_type, b.event_id)) as count from",
    );
  });

  it("rejects a metadata filter as an invalid request", async () => {
    await expect(
      new QueryBuilder(undefined, "v2").build(
        {
          ...query,
          filters: [
            {
              column: "metadata",
              type: "stringObject",
              key: "k",
              operator: "=",
              value: "v",
            },
          ],
        },
        "project-1",
      ),
    ).rejects.toThrow(InvalidRequestError);
  });
});
