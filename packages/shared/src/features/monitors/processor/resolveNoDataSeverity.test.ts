import { describe, it, expect } from "vitest";

import { resolveNoDataSeverity } from "./resolveNoDataSeverity";
import type { MonitorNoData, MonitorSeverity } from "../types";
import type { metricAggregations } from "../../query/types";
import type { z } from "zod";

/** ResolveCase is one resolveNoDataSeverity table row: inputs and the expected severity. */
type ResolveCase = {
  name: string;
  noData: MonitorNoData;
  aggregation: z.infer<typeof metricAggregations>;
  prevSeverity: MonitorSeverity;
  expected: MonitorSeverity;
};

const thresholds = {
  operator: "GT" as const,
  alertThreshold: 100,
  warningThreshold: 50,
};

/** cases covers all 6 modes across additive/distributional aggregations and representative prev severities. */
const cases: ResolveCase[] = [
  {
    name: "AUTOMATIC + count (additive) -> substituted 0 -> OK",
    noData: { mode: "AUTOMATIC" },
    aggregation: "count",
    prevSeverity: "ALERT",
    expected: "OK",
  },
  {
    name: "AUTOMATIC + sum (additive) -> substituted 0 -> OK",
    noData: { mode: "AUTOMATIC" },
    aggregation: "sum",
    prevSeverity: "WARNING",
    expected: "OK",
  },
  {
    name: "AUTOMATIC + uniq (additive) -> substituted 0 -> OK",
    noData: { mode: "AUTOMATIC" },
    aggregation: "uniq",
    prevSeverity: "ALERT",
    expected: "OK",
  },
  {
    name: "AUTOMATIC + avg (distributional) -> prev severity",
    noData: { mode: "AUTOMATIC" },
    aggregation: "avg",
    prevSeverity: "WARNING",
    expected: "WARNING",
  },
  {
    name: "AUTOMATIC + p95 (distributional) -> prev severity",
    noData: { mode: "AUTOMATIC" },
    aggregation: "p95",
    prevSeverity: "ALERT",
    expected: "ALERT",
  },
  {
    name: "AUTOMATIC + histogram (distributional) -> prev severity",
    noData: { mode: "AUTOMATIC" },
    aggregation: "histogram",
    prevSeverity: "OK",
    expected: "OK",
  },
  {
    name: "SUBSTITUTE_ZERO + count -> 0 through thresholds -> OK",
    noData: { mode: "SUBSTITUTE_ZERO" },
    aggregation: "count",
    prevSeverity: "ALERT",
    expected: "OK",
  },
  {
    name: "SUBSTITUTE_ZERO + avg -> 0 through thresholds -> OK",
    noData: { mode: "SUBSTITUTE_ZERO" },
    aggregation: "avg",
    prevSeverity: "ALERT",
    expected: "OK",
  },
  {
    name: "LAST_SEVERITY + count -> prev severity",
    noData: { mode: "LAST_SEVERITY" },
    aggregation: "count",
    prevSeverity: "ALERT",
    expected: "ALERT",
  },
  {
    name: "LAST_SEVERITY + avg -> prev severity",
    noData: { mode: "LAST_SEVERITY" },
    aggregation: "avg",
    prevSeverity: "WARNING",
    expected: "WARNING",
  },
  {
    name: "SHOW_NO_DATA + count -> NO_DATA",
    noData: { mode: "SHOW_NO_DATA" },
    aggregation: "count",
    prevSeverity: "OK",
    expected: "NO_DATA",
  },
  {
    name: "SHOW_NO_DATA + avg -> NO_DATA",
    noData: { mode: "SHOW_NO_DATA" },
    aggregation: "avg",
    prevSeverity: "ALERT",
    expected: "NO_DATA",
  },
  {
    name: "NOTIFY_NO_DATA + count -> NO_DATA",
    noData: { mode: "NOTIFY_NO_DATA", intervalMinutes: 60 },
    aggregation: "count",
    prevSeverity: "OK",
    expected: "NO_DATA",
  },
  {
    name: "NOTIFY_NO_DATA + avg -> NO_DATA",
    noData: { mode: "NOTIFY_NO_DATA", intervalMinutes: 60 },
    aggregation: "avg",
    prevSeverity: "WARNING",
    expected: "NO_DATA",
  },
  {
    name: "RESOLVE + count -> OK",
    noData: { mode: "RESOLVE" },
    aggregation: "count",
    prevSeverity: "ALERT",
    expected: "OK",
  },
  {
    name: "RESOLVE + avg -> OK",
    noData: { mode: "RESOLVE" },
    aggregation: "avg",
    prevSeverity: "WARNING",
    expected: "OK",
  },
];

describe("resolveNoDataSeverity", () => {
  it.each(cases)("$name", ({ noData, aggregation, prevSeverity, expected }) => {
    expect(
      resolveNoDataSeverity({
        noData,
        aggregation,
        prevSeverity,
        operator: thresholds.operator,
        alertThreshold: thresholds.alertThreshold,
        warningThreshold: thresholds.warningThreshold,
      }),
    ).toBe(expected);
  });

  it("SUBSTITUTE_ZERO + GTE alert at 0 -> ALERT", () => {
    expect(
      resolveNoDataSeverity({
        noData: { mode: "SUBSTITUTE_ZERO" },
        aggregation: "count",
        prevSeverity: "OK",
        operator: "GTE",
        alertThreshold: 0,
        warningThreshold: null,
      }),
    ).toBe("ALERT");
  });
});
