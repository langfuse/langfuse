import { describe, it, expect } from "vitest";

import type { Monitor, MonitorSeverity } from "../types";
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
  thresholdOperator: "GT",
  alertThreshold: 100,
  warningThreshold: 50,
  noData: { mode: "SILENT" },
  renotify: { mode: "OFF" },
  name: "Latency monitor",
  tags: [],
  triggerIds: [],
  severity: "OK",
  severityChangedAt: null,
  alertedAt: null,
  status: "ACTIVE",
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
  severity,
  severityChangedAt: null,
  alertedAt: null,
});

/** Case is one renderAlertMessage table row. */
type Case = {
  name: string;
  monitor: Partial<Monitor>;
  next: MonitorSeverity;
  expected: { title: string; body: string };
};

/** metricRef is the rendered metric reference for baseMonitor's metric. */
const metricRef = "`p95(observations.latency)`";

/** cases covers the body-shape branches. */
const cases: Case[] = [
  {
    name: "NO_DATA: body reports no data over the window",
    monitor: { severity: "OK", window: "1h" },
    next: "NO_DATA",
    expected: {
      title: "[NO_DATA] Latency monitor",
      body: `${metricRef} has no data over the last **1h**`,
    },
  },
  {
    name: "NO_DATA -> OK: body reports recovery and data again",
    monitor: { severity: "NO_DATA" },
    next: "OK",
    expected: {
      title: "[OK] Latency monitor",
      body: `${metricRef} recovered and is reporting data again`,
    },
  },
  {
    name: "OK from a threshold severity: body reports recovery",
    monitor: { severity: "ALERT" },
    next: "OK",
    expected: {
      title: "[OK] Latency monitor",
      body: `${metricRef} recovered`,
    },
  },
  {
    name: "ALERT: body uses alert threshold",
    monitor: { severity: "OK", thresholdOperator: "GT", alertThreshold: 100 },
    next: "ALERT",
    expected: {
      title: "[ALERT] Latency monitor",
      body: `${metricRef} is **above** \`100\``,
    },
  },
  {
    name: "WARNING with warning band: body uses warning threshold",
    monitor: { severity: "OK", alertThreshold: 100, warningThreshold: 50 },
    next: "WARNING",
    expected: {
      title: "[WARNING] Latency monitor",
      body: `${metricRef} is **above** \`50\``,
    },
  },
  {
    name: "WARNING with null warning band: falls back to alert threshold",
    monitor: { severity: "OK", alertThreshold: 100, warningThreshold: null },
    next: "WARNING",
    expected: {
      title: "[WARNING] Latency monitor",
      body: `${metricRef} is **above** \`100\``,
    },
  },
];

describe("renderAlertMessage", () => {
  it.each(cases)("$name", ({ monitor, next, expected }) => {
    const result = renderAlertMessage({
      monitor: { ...baseMonitor, ...monitor },
      completion: completion(next),
    });
    expect(result).toEqual(expected);
  });

  /** OperatorCase pairs a threshold operator with its rendered word. */
  type OperatorCase = { op: Monitor["thresholdOperator"]; word: string };
  /** operatorCases covers every operator's rendered word. */
  const operatorCases: OperatorCase[] = [
    { op: "GT", word: "above" },
    { op: "GTE", word: "at or above" },
    { op: "LT", word: "below" },
    { op: "LTE", word: "at or below" },
    { op: "EQ", word: "equal to" },
    { op: "NEQ", word: "not equal to" },
  ];

  it.each(operatorCases)(
    "$op: body renders operator as '$word'",
    ({ op, word }) => {
      const result = renderAlertMessage({
        monitor: {
          ...baseMonitor,
          severity: "OK",
          thresholdOperator: op,
          alertThreshold: 100,
        },
        completion: completion("ALERT"),
      });
      expect(result.body).toBe(`${metricRef} is **${word}** \`100\``);
    },
  );
});
