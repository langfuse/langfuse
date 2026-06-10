import { describe, it, expect } from "vitest";

import { resolveNoDataSeverity } from "./resolveNoDataSeverity";
import {
  MonitorNoDataModeSchema,
  MonitorSeveritySchema,
  MonitorThresholdOperatorSchema,
  type MonitorNoData,
  type MonitorSeverity,
} from "../types";

/** ResolveCase is one resolveNoDataSeverity table row: inputs and the expected severity. */
type ResolveCase = {
  name: string;
  noData: MonitorNoData;
  prevSeverity: MonitorSeverity;
  expected: MonitorSeverity;
};

const thresholds = {
  operator: MonitorThresholdOperatorSchema.enum.GT,
  alertThreshold: 100,
  warningThreshold: 50,
};

/** cases covers all 4 modes across representative prev severities. */
const cases: ResolveCase[] = [
  {
    name: "SUBSTITUTE_ZERO -> 0 through thresholds -> OK",
    noData: { mode: MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO },
    prevSeverity: MonitorSeveritySchema.enum.ALERT,
    expected: MonitorSeveritySchema.enum.OK,
  },
  {
    name: "LAST_SEVERITY -> prev severity (ALERT)",
    noData: { mode: MonitorNoDataModeSchema.enum.LAST_SEVERITY },
    prevSeverity: MonitorSeveritySchema.enum.ALERT,
    expected: MonitorSeveritySchema.enum.ALERT,
  },
  {
    name: "LAST_SEVERITY -> prev severity (WARNING)",
    noData: { mode: MonitorNoDataModeSchema.enum.LAST_SEVERITY },
    prevSeverity: MonitorSeveritySchema.enum.WARNING,
    expected: MonitorSeveritySchema.enum.WARNING,
  },
  {
    name: "SHOW_NO_DATA -> NO_DATA",
    noData: { mode: MonitorNoDataModeSchema.enum.SHOW_NO_DATA },
    prevSeverity: MonitorSeveritySchema.enum.OK,
    expected: MonitorSeveritySchema.enum.NO_DATA,
  },
  {
    name: "NOTIFY_NO_DATA -> NO_DATA",
    noData: {
      mode: MonitorNoDataModeSchema.enum.NOTIFY_NO_DATA,
      intervalMinutes: 60,
    },
    prevSeverity: MonitorSeveritySchema.enum.OK,
    expected: MonitorSeveritySchema.enum.NO_DATA,
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
        noData: { mode: MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO },
        prevSeverity: MonitorSeveritySchema.enum.OK,
        operator: MonitorThresholdOperatorSchema.enum.GTE,
        alertThreshold: 0,
        warningThreshold: null,
      }),
    ).toBe(MonitorSeveritySchema.enum.ALERT);
  });
});
