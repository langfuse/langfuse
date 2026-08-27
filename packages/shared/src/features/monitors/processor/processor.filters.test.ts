import { describe, expect, it } from "vitest";

import type { MonitorFilters } from "../types";
import {
  buildMonitorQuery,
  filtersFingerprint,
  groupMonitorsByFilters,
} from "./processorQueryHelpers";

describe("groupMonitorsByFilters", () => {
  it("groups monitors that share the same canonical filter set", () => {
    const envFilter = {
      column: "environment" as const,
      operator: "any of" as const,
      value: ["prd"],
      type: "stringOptions" as const,
    };
    const typeFilter = {
      column: "type" as const,
      operator: "any of" as const,
      value: ["GENERATION"],
      type: "stringOptions" as const,
    };

    const groups = groupMonitorsByFilters([
      {
        id: "m_a",
        filters: [envFilter, typeFilter],
      } as never,
      {
        id: "m_b",
        filters: [typeFilter, envFilter],
      } as never,
      {
        id: "m_c",
        filters: [envFilter],
      } as never,
    ]);

    expect(groups).toHaveLength(2);
    expect(
      groups.find((g) => g.monitorIds.includes("m_a"))?.monitorIds,
    ).toEqual(expect.arrayContaining(["m_a", "m_b"]));
    expect(groups.find((g) => g.monitorIds.includes("m_c"))?.filters).toEqual([
      envFilter,
    ]);
  });
});

describe("filtersFingerprint", () => {
  it("is permutation-invariant for set-semantics filters", () => {
    const a: MonitorFilters = [
      {
        column: "environment",
        operator: "any of",
        value: ["prd", "staging"],
        type: "stringOptions",
      },
    ];
    const b: MonitorFilters = [
      {
        column: "environment",
        operator: "any of",
        value: ["staging", "prd"],
        type: "stringOptions",
      },
    ];

    expect(filtersFingerprint(a)).toBe(filtersFingerprint(b));
  });
});

describe("buildMonitorQuery", () => {
  it("uses the supplied monitor filters instead of the queue event filters", () => {
    const query = buildMonitorQuery(
      [{ measure: "latency", aggregation: "p95" }],
      {
        view: "observations",
        window: "1d",
        runAt: new Date("2026-05-27T12:00:00.000Z"),
        filters: [
          {
            column: "environment",
            operator: "any of",
            value: ["prd"],
            type: "stringOptions",
          },
        ],
      } as never,
      [
        {
          column: "environment",
          operator: "any of",
          value: ["prd"],
          type: "stringOptions",
        },
        {
          column: "type",
          operator: "any of",
          value: ["GENERATION"],
          type: "stringOptions",
        },
      ],
    );

    expect(query.filters).toEqual([
      {
        column: "environment",
        operator: "any of",
        value: ["prd"],
        type: "stringOptions",
      },
      {
        column: "type",
        operator: "any of",
        value: ["GENERATION"],
        type: "stringOptions",
      },
    ]);
  });
});
