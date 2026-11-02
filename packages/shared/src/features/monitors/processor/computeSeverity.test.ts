import { describe, it, expect } from "vitest";

import { computeSeverity } from "./computeSeverity";
import {
  MonitorNoDataModeSchema,
  MonitorSeveritySchema,
  MonitorThresholdOperatorSchema,
  type MonitorNoData,
  type MonitorSeverity,
  type MonitorThresholdOperator,
} from "../types";

/** ComputeSeverityCase is one computeSeverity table row: inputs and the expected severity. */
type ComputeSeverityCase = {
  name: string;
  input: {
    value: number;
    operator: MonitorThresholdOperator;
    alertThreshold: number;
    warningThreshold: number | null;
  };
  expected: "OK" | "WARNING" | "ALERT";
};

/** NoDataCase is one no-data computeSeverity table row: a null value resolved per noData mode. */
type NoDataCase = {
  name: string;
  noData: MonitorNoData;
  prevSeverity: MonitorSeverity;
  expected: MonitorSeverity;
};

/** cases covers each operator's alert/warning/OK bands. */
const cases: ComputeSeverityCase[] = [
  {
    name: "GT: value > alert -> ALERT",
    input: {
      value: 120,
      operator: MonitorThresholdOperatorSchema.enum.GT,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.ALERT,
  },
  {
    name: "GT: value == alert, no warning -> OK (strict >)",
    input: {
      value: 100,
      operator: MonitorThresholdOperatorSchema.enum.GT,
      alertThreshold: 100,
      warningThreshold: null,
    },
    expected: MonitorSeveritySchema.enum.OK,
  },
  {
    name: "GT: value > warning, value <= alert -> WARNING",
    input: {
      value: 80,
      operator: MonitorThresholdOperatorSchema.enum.GT,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.WARNING,
  },
  {
    name: "GT: value == warning -> OK (strict >)",
    input: {
      value: 50,
      operator: MonitorThresholdOperatorSchema.enum.GT,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.OK,
  },
  {
    name: "GT: value < warning -> OK",
    input: {
      value: 40,
      operator: MonitorThresholdOperatorSchema.enum.GT,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.OK,
  },
  {
    name: "GT: value > alert, no warning -> ALERT",
    input: {
      value: 120,
      operator: MonitorThresholdOperatorSchema.enum.GT,
      alertThreshold: 100,
      warningThreshold: null,
    },
    expected: MonitorSeveritySchema.enum.ALERT,
  },
  {
    name: "GT: value < alert, no warning -> OK",
    input: {
      value: 80,
      operator: MonitorThresholdOperatorSchema.enum.GT,
      alertThreshold: 100,
      warningThreshold: null,
    },
    expected: MonitorSeveritySchema.enum.OK,
  },

  {
    name: "GTE: value == alert -> ALERT",
    input: {
      value: 100,
      operator: MonitorThresholdOperatorSchema.enum.GTE,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.ALERT,
  },
  {
    name: "GTE: value > alert -> ALERT",
    input: {
      value: 101,
      operator: MonitorThresholdOperatorSchema.enum.GTE,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.ALERT,
  },
  {
    name: "GTE: value == warning -> WARNING",
    input: {
      value: 50,
      operator: MonitorThresholdOperatorSchema.enum.GTE,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.WARNING,
  },
  {
    name: "GTE: value < warning -> OK",
    input: {
      value: 49,
      operator: MonitorThresholdOperatorSchema.enum.GTE,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.OK,
  },

  {
    name: "LT: value < alert -> ALERT",
    input: {
      value: 80,
      operator: MonitorThresholdOperatorSchema.enum.LT,
      alertThreshold: 100,
      warningThreshold: 150,
    },
    expected: MonitorSeveritySchema.enum.ALERT,
  },
  {
    name: "LT: value == alert, no warning -> OK (strict <)",
    input: {
      value: 100,
      operator: MonitorThresholdOperatorSchema.enum.LT,
      alertThreshold: 100,
      warningThreshold: null,
    },
    expected: MonitorSeveritySchema.enum.OK,
  },
  {
    name: "LT: value < warning, value >= alert -> WARNING",
    input: {
      value: 120,
      operator: MonitorThresholdOperatorSchema.enum.LT,
      alertThreshold: 100,
      warningThreshold: 150,
    },
    expected: MonitorSeveritySchema.enum.WARNING,
  },
  {
    name: "LT: value > warning -> OK",
    input: {
      value: 200,
      operator: MonitorThresholdOperatorSchema.enum.LT,
      alertThreshold: 100,
      warningThreshold: 150,
    },
    expected: MonitorSeveritySchema.enum.OK,
  },

  {
    name: "LTE: value == alert -> ALERT",
    input: {
      value: 100,
      operator: MonitorThresholdOperatorSchema.enum.LTE,
      alertThreshold: 100,
      warningThreshold: 150,
    },
    expected: MonitorSeveritySchema.enum.ALERT,
  },
  {
    name: "LTE: value == warning -> WARNING",
    input: {
      value: 150,
      operator: MonitorThresholdOperatorSchema.enum.LTE,
      alertThreshold: 100,
      warningThreshold: 150,
    },
    expected: MonitorSeveritySchema.enum.WARNING,
  },
  {
    name: "LTE: value > warning -> OK",
    input: {
      value: 151,
      operator: MonitorThresholdOperatorSchema.enum.LTE,
      alertThreshold: 100,
      warningThreshold: 150,
    },
    expected: MonitorSeveritySchema.enum.OK,
  },

  {
    name: "EQ: value == alert -> ALERT",
    input: {
      value: 100,
      operator: MonitorThresholdOperatorSchema.enum.EQ,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.ALERT,
  },
  {
    name: "EQ: value == warning -> WARNING",
    input: {
      value: 50,
      operator: MonitorThresholdOperatorSchema.enum.EQ,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.WARNING,
  },
  {
    name: "EQ: value matches neither -> OK",
    input: {
      value: 75,
      operator: MonitorThresholdOperatorSchema.enum.EQ,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.OK,
  },

  {
    name: "NEQ: value != alert -> ALERT (alert checked first)",
    input: {
      value: 99,
      operator: MonitorThresholdOperatorSchema.enum.NEQ,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.ALERT,
  },
  {
    name: "NEQ: value == alert, value != warning -> WARNING",
    input: {
      value: 100,
      operator: MonitorThresholdOperatorSchema.enum.NEQ,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: MonitorSeveritySchema.enum.WARNING,
  },
  {
    name: "NEQ: value == alert == warning -> OK",
    input: {
      value: 100,
      operator: MonitorThresholdOperatorSchema.enum.NEQ,
      alertThreshold: 100,
      warningThreshold: 100,
    },
    expected: MonitorSeveritySchema.enum.OK,
  },
];

const noDataDefaults = {
  noData: { mode: MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO },
  prevSeverity: MonitorSeveritySchema.enum.OK,
};

const noDataThresholds = {
  operator: MonitorThresholdOperatorSchema.enum.GT,
  alertThreshold: 100,
  warningThreshold: 50,
};

const noDataCases: NoDataCase[] = [
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

describe("computeSeverity", () => {
  it.each(cases)("$name", ({ input, expected }) => {
    expect(computeSeverity({ ...input, ...noDataDefaults })).toBe(expected);
  });

  it("non-null value ignores noData mode", () => {
    expect(
      computeSeverity({
        value: 120,
        noData: { mode: MonitorNoDataModeSchema.enum.SHOW_NO_DATA },
        prevSeverity: MonitorSeveritySchema.enum.OK,
        operator: MonitorThresholdOperatorSchema.enum.GT,
        alertThreshold: 100,
        warningThreshold: 50,
      }),
    ).toBe(MonitorSeveritySchema.enum.ALERT);
  });
});

describe("computeSeverity: no data", () => {
  it.each(noDataCases)("$name", ({ noData, prevSeverity, expected }) => {
    expect(
      computeSeverity({
        value: null,
        noData,
        prevSeverity,
        operator: noDataThresholds.operator,
        alertThreshold: noDataThresholds.alertThreshold,
        warningThreshold: noDataThresholds.warningThreshold,
      }),
    ).toBe(expected);
  });

  it("SUBSTITUTE_ZERO + GTE alert at 0 -> ALERT", () => {
    expect(
      computeSeverity({
        value: null,
        noData: { mode: MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO },
        prevSeverity: MonitorSeveritySchema.enum.OK,
        operator: MonitorThresholdOperatorSchema.enum.GTE,
        alertThreshold: 0,
        warningThreshold: null,
      }),
    ).toBe(MonitorSeveritySchema.enum.ALERT);
  });
});
