import { describe, it, expect } from "vitest";

import {
  MonitorNoDataModeSchema,
  MonitorSeveritySchema,
  MonitorStatusSchema,
  MonitorThresholdOperatorSchema,
  type Monitor,
  type MonitorSeverity,
} from "../types";
import type { MonitorCompletion } from "./applyStateMachine";
import { renderAlertMessage } from "./renderAlertMessage";

const t0 = new Date("2024-01-01T00:00:00.000Z");

/** baseMonitor supplies the Monitor fields each case overrides. */
const baseMonitor: Monitor = {
  id: "m_test",
  createdAt: t0,
  updatedAt: t0,
  createdBy: null,
  updatedBy: null,
  projectId: "p_test",
  view: "observations",
  filters: [],
  metric: { measure: "latency", aggregation: "p95" },
  window: "5m",
  thresholdOperator: MonitorThresholdOperatorSchema.enum.GT,
  alertThreshold: 100,
  warningThreshold: 50,
  noData: { mode: MonitorNoDataModeSchema.enum.SHOW_NO_DATA },
  renotify: { mode: "OFF" },
  name: "Latency monitor",
  tags: [],
  triggerIds: [],
  severity: MonitorSeveritySchema.enum.OK,
  severityChangedAt: null,
  alertedAt: null,
  status: MonitorStatusSchema.enum.ACTIVE,
  nextRunAt: null,
  lastPublishedAt: null,
  lastClaimedAt: null,
  lastCompletedAt: null,
};

/** completion builds a MonitorCompletion for a given severity. */
const completion = (severity: MonitorSeverity): MonitorCompletion => ({
  monitorId: baseMonitor.id,
  lastClaimedAt: t0,
  lastCompletedAt: t0,
  publishedAt: t0,
  status: MonitorStatusSchema.enum.ACTIVE,
  severity,
  severityChangedAt: null,
  alertedAt: null,
});

/** Case is one renderAlertMessage table row. */
type Case = {
  name: string;
  monitor: Partial<Monitor>;
  next: MonitorSeverity;
  value?: number | null;
  expected: { title: string; body: string };
};

/** metricRef is the rendered metric reference for baseMonitor's metric. */
const metricRef = "`p95(observations.latency)`";

/** metricExpr is baseMonitor's metric expression without code fences. */
const metricExpr = "p95(observations.latency)";

/** cases covers the body-shape branches. */
const cases: Case[] = [
  {
    name: "NO_DATA: body reports no data over the window",
    monitor: { severity: MonitorSeveritySchema.enum.OK, window: "1h" },
    next: MonitorSeveritySchema.enum.NO_DATA,
    expected: {
      title: "[NO_DATA] Latency monitor",
      body: `${metricRef} has no data over the last **1h**`,
    },
  },
  {
    name: "NO_DATA -> OK: body reports recovery and data again",
    monitor: { severity: MonitorSeveritySchema.enum.NO_DATA },
    next: MonitorSeveritySchema.enum.OK,
    expected: {
      title: "[OK] Latency monitor",
      body: `${metricRef} recovered and is reporting data again`,
    },
  },
  {
    name: "OK from a threshold severity: body reports recovery",
    monitor: { severity: MonitorSeveritySchema.enum.ALERT },
    next: MonitorSeveritySchema.enum.OK,
    expected: {
      title: "[OK] Latency monitor",
      body: `${metricRef} recovered`,
    },
  },
  {
    name: "ALERT: body uses alert threshold",
    monitor: {
      severity: MonitorSeveritySchema.enum.OK,
      thresholdOperator: MonitorThresholdOperatorSchema.enum.GT,
      alertThreshold: 100,
    },
    next: MonitorSeveritySchema.enum.ALERT,
    value: 130,
    expected: {
      title: "[ALERT] Latency monitor",
      body: `\`${metricExpr} = 130 ms\` over the last **5m**\nThis is **above** the **ALERT** threshold of \`100 ms\``,
    },
  },
  {
    name: "WARNING with warning band: body uses warning threshold",
    monitor: {
      severity: MonitorSeveritySchema.enum.OK,
      alertThreshold: 100,
      warningThreshold: 50,
    },
    next: MonitorSeveritySchema.enum.WARNING,
    value: 75,
    expected: {
      title: "[WARNING] Latency monitor",
      body: `\`${metricExpr} = 75 ms\` over the last **5m**\nThis is **above** the **WARNING** threshold of \`50 ms\``,
    },
  },
  {
    name: "WARNING with null warning band: falls back to alert threshold",
    monitor: {
      severity: MonitorSeveritySchema.enum.OK,
      alertThreshold: 100,
      warningThreshold: null,
    },
    next: MonitorSeveritySchema.enum.WARNING,
    value: 120,
    expected: {
      title: "[WARNING] Latency monitor",
      body: `\`${metricExpr} = 120 ms\` over the last **5m**\nThis is **above** the **WARNING** threshold of \`100 ms\``,
    },
  },
  {
    name: "ALERT with a fractional value: body rounds the value",
    monitor: { severity: MonitorSeveritySchema.enum.OK, alertThreshold: 100 },
    next: MonitorSeveritySchema.enum.ALERT,
    value: 123.456789,
    expected: {
      title: "[ALERT] Latency monitor",
      body: `\`${metricExpr} = 123.46 ms\` over the last **5m**\nThis is **above** the **ALERT** threshold of \`100 ms\``,
    },
  },
  {
    name: "ALERT from missing data treated as 0: body says the value was substituted",
    monitor: {
      severity: MonitorSeveritySchema.enum.OK,
      thresholdOperator: MonitorThresholdOperatorSchema.enum.LT,
      alertThreshold: 1,
      noData: { mode: MonitorNoDataModeSchema.enum.SUBSTITUTE_ZERO },
    },
    next: MonitorSeveritySchema.enum.ALERT,
    value: null,
    expected: {
      title: "[ALERT] Latency monitor",
      body: `\`${metricExpr} = 0 ms\` over the last **5m** (no data, treated as 0)\nThis is **below** the **ALERT** threshold of \`1 ms\``,
    },
  },
  {
    name: "ALERT on a cost metric: body prefixes value and threshold with $",
    monitor: {
      severity: MonitorSeveritySchema.enum.OK,
      metric: { measure: "totalCost", aggregation: "sum" },
      alertThreshold: 20,
    },
    next: MonitorSeveritySchema.enum.ALERT,
    value: 42.5,
    expected: {
      title: "[ALERT] Latency monitor",
      body: "`sum(observations.totalCost) = $42.5` over the last **5m**\nThis is **above** the **ALERT** threshold of `$20`",
    },
  },
  {
    name: "ALERT on a row count: body leaves value and threshold unitless",
    monitor: {
      severity: MonitorSeveritySchema.enum.OK,
      metric: { measure: "count", aggregation: "count" },
      alertThreshold: 20,
    },
    next: MonitorSeveritySchema.enum.ALERT,
    value: 30,
    expected: {
      title: "[ALERT] Latency monitor",
      body: "`count(observations.count) = 30` over the last **5m**\nThis is **above** the **ALERT** threshold of `20`",
    },
  },
];

describe("renderAlertMessage", () => {
  it.each(cases)("$name", ({ monitor, next, value, expected }) => {
    const result = renderAlertMessage({
      monitor: { ...baseMonitor, ...monitor },
      completion: completion(next),
      value: value ?? null,
    });
    expect(result).toEqual(expected);
  });

  /** OperatorCase pairs a threshold operator with its rendered word. */
  type OperatorCase = { op: Monitor["thresholdOperator"]; word: string };
  /** operatorCases covers every operator's rendered word. */
  const operatorCases: OperatorCase[] = [
    { op: MonitorThresholdOperatorSchema.enum.GT, word: "above" },
    { op: MonitorThresholdOperatorSchema.enum.GTE, word: "at or above" },
    { op: MonitorThresholdOperatorSchema.enum.LT, word: "below" },
    { op: MonitorThresholdOperatorSchema.enum.LTE, word: "at or below" },
    { op: MonitorThresholdOperatorSchema.enum.EQ, word: "equal to" },
    { op: MonitorThresholdOperatorSchema.enum.NEQ, word: "not equal to" },
  ];

  it.each(operatorCases)(
    "$op: body renders operator as '$word'",
    ({ op, word }) => {
      const result = renderAlertMessage({
        monitor: {
          ...baseMonitor,
          severity: MonitorSeveritySchema.enum.OK,
          thresholdOperator: op,
          alertThreshold: 100,
        },
        completion: completion(MonitorSeveritySchema.enum.ALERT),
        value: 100,
      });
      expect(result.body).toBe(
        `\`${metricExpr} = 100 ms\` over the last **5m**\nThis is **${word}** the **ALERT** threshold of \`100 ms\``,
      );
    },
  );
});
