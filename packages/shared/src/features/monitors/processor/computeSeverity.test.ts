import { describe, it, expect } from "vitest";

import { computeSeverity } from "./computeSeverity";
import type { MonitorThresholdOperator } from "../types";

type ComputeSeverityCase = {
  name: string;
  input: {
    value: number | null;
    operator: MonitorThresholdOperator;
    alertThreshold: number;
    warningThreshold: number | null;
  };
  expected: "NO_DATA" | "OK" | "WARNING" | "ALERT";
};

const cases: ComputeSeverityCase[] = [
  // === NO_DATA branch ===
  {
    name: "null value -> NO_DATA (with warning)",
    input: {
      value: null,
      operator: "GT",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "NO_DATA",
  },
  {
    name: "null value -> NO_DATA (no warning)",
    input: {
      value: null,
      operator: "LT",
      alertThreshold: 100,
      warningThreshold: null,
    },
    expected: "NO_DATA",
  },

  // === GT (>) ===
  {
    name: "GT: value > alert -> ALERT",
    input: {
      value: 120,
      operator: "GT",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "ALERT",
  },
  {
    name: "GT: value == alert, no warning -> OK (strict >)",
    input: {
      value: 100,
      operator: "GT",
      alertThreshold: 100,
      warningThreshold: null,
    },
    expected: "OK",
  },
  {
    name: "GT: value > warning, value <= alert -> WARNING",
    input: {
      value: 80,
      operator: "GT",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "WARNING",
  },
  {
    name: "GT: value == warning -> OK (strict >)",
    input: {
      value: 50,
      operator: "GT",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "OK",
  },
  {
    name: "GT: value < warning -> OK",
    input: {
      value: 40,
      operator: "GT",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "OK",
  },
  {
    name: "GT: value > alert, no warning -> ALERT",
    input: {
      value: 120,
      operator: "GT",
      alertThreshold: 100,
      warningThreshold: null,
    },
    expected: "ALERT",
  },
  {
    name: "GT: value < alert, no warning -> OK",
    input: {
      value: 80,
      operator: "GT",
      alertThreshold: 100,
      warningThreshold: null,
    },
    expected: "OK",
  },

  // === GTE (>=) ===
  {
    name: "GTE: value == alert -> ALERT",
    input: {
      value: 100,
      operator: "GTE",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "ALERT",
  },
  {
    name: "GTE: value > alert -> ALERT",
    input: {
      value: 101,
      operator: "GTE",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "ALERT",
  },
  {
    name: "GTE: value == warning -> WARNING",
    input: {
      value: 50,
      operator: "GTE",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "WARNING",
  },
  {
    name: "GTE: value < warning -> OK",
    input: {
      value: 49,
      operator: "GTE",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "OK",
  },

  // === LT (<) ===
  {
    name: "LT: value < alert -> ALERT",
    input: {
      value: 80,
      operator: "LT",
      alertThreshold: 100,
      warningThreshold: 150,
    },
    expected: "ALERT",
  },
  {
    name: "LT: value == alert, no warning -> OK (strict <)",
    input: {
      value: 100,
      operator: "LT",
      alertThreshold: 100,
      warningThreshold: null,
    },
    expected: "OK",
  },
  {
    name: "LT: value < warning, value >= alert -> WARNING",
    input: {
      value: 120,
      operator: "LT",
      alertThreshold: 100,
      warningThreshold: 150,
    },
    expected: "WARNING",
  },
  {
    name: "LT: value > warning -> OK",
    input: {
      value: 200,
      operator: "LT",
      alertThreshold: 100,
      warningThreshold: 150,
    },
    expected: "OK",
  },

  // === LTE (<=) ===
  {
    name: "LTE: value == alert -> ALERT",
    input: {
      value: 100,
      operator: "LTE",
      alertThreshold: 100,
      warningThreshold: 150,
    },
    expected: "ALERT",
  },
  {
    name: "LTE: value == warning -> WARNING",
    input: {
      value: 150,
      operator: "LTE",
      alertThreshold: 100,
      warningThreshold: 150,
    },
    expected: "WARNING",
  },
  {
    name: "LTE: value > warning -> OK",
    input: {
      value: 151,
      operator: "LTE",
      alertThreshold: 100,
      warningThreshold: 150,
    },
    expected: "OK",
  },

  // === EQ (==) ===
  {
    name: "EQ: value == alert -> ALERT",
    input: {
      value: 100,
      operator: "EQ",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "ALERT",
  },
  {
    name: "EQ: value == warning -> WARNING",
    input: {
      value: 50,
      operator: "EQ",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "WARNING",
  },
  {
    name: "EQ: value matches neither -> OK",
    input: {
      value: 75,
      operator: "EQ",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "OK",
  },

  // === NEQ (!=) ===
  {
    name: "NEQ: value != alert -> ALERT (alert checked first)",
    input: {
      value: 99,
      operator: "NEQ",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "ALERT",
  },
  {
    name: "NEQ: value == alert, value != warning -> WARNING",
    input: {
      value: 100,
      operator: "NEQ",
      alertThreshold: 100,
      warningThreshold: 50,
    },
    expected: "WARNING",
  },
  {
    name: "NEQ: value == alert == warning -> OK",
    input: {
      value: 100,
      operator: "NEQ",
      alertThreshold: 100,
      warningThreshold: 100,
    },
    expected: "OK",
  },
];

describe("computeSeverity", () => {
  it.each(cases)("$name", ({ input, expected }) => {
    expect(computeSeverity(input)).toBe(expected);
  });
});
