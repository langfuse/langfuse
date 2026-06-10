import { describe, it, expect } from "vitest";

import { resolveNoDataSeverity } from "./resolveNoDataSeverity";
import type { MonitorNoData, MonitorSeverity } from "../types";

/** ResolveCase is one resolveNoDataSeverity table row: inputs and the expected severity. */
type ResolveCase = {
  name: string;
  noData: MonitorNoData;
  prevSeverity: MonitorSeverity;
  expected: MonitorSeverity;
};

const thresholds = {
  operator: "GT" as const,
  alertThreshold: 100,
  warningThreshold: 50,
};

/** cases covers all 4 modes across representative prev severities. */
const cases: ResolveCase[] = [
  {
    name: "SUBSTITUTE_ZERO -> 0 through thresholds -> OK",
    noData: { mode: "SUBSTITUTE_ZERO" },
    prevSeverity: "ALERT",
    expected: "OK",
  },
  {
    name: "LAST_SEVERITY -> prev severity (ALERT)",
    noData: { mode: "LAST_SEVERITY" },
    prevSeverity: "ALERT",
    expected: "ALERT",
  },
  {
    name: "LAST_SEVERITY -> prev severity (WARNING)",
    noData: { mode: "LAST_SEVERITY" },
    prevSeverity: "WARNING",
    expected: "WARNING",
  },
  {
    name: "SHOW_NO_DATA -> NO_DATA",
    noData: { mode: "SHOW_NO_DATA" },
    prevSeverity: "OK",
    expected: "NO_DATA",
  },
  {
    name: "NOTIFY_NO_DATA -> NO_DATA",
    noData: { mode: "NOTIFY_NO_DATA", intervalMinutes: 60 },
    prevSeverity: "OK",
    expected: "NO_DATA",
  },
];

describe("resolveNoDataSeverity", () => {
  it.each(cases)("$name", ({ noData, prevSeverity, expected }) => {
    expect(
      resolveNoDataSeverity({
        noData,
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
        prevSeverity: "OK",
        operator: "GTE",
        alertThreshold: 0,
        warningThreshold: null,
      }),
    ).toBe("ALERT");
  });
});
