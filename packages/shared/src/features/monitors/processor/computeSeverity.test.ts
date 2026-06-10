import { describe, it, expect } from "vitest";

import { computeSeverity } from "./computeSeverity";
import {
  MonitorSeveritySchema,
  MonitorThresholdOperatorSchema,
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

describe("computeSeverity", () => {
  it.each(cases)("$name", ({ input, expected }) => {
    expect(computeSeverity(input)).toBe(expected);
  });
});
