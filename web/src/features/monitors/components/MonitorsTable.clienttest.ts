import { describe, expect, it } from "vitest";

import { type FilterState } from "@langfuse/shared";
import {
  type Monitor,
  MonitorNoDataModeSchema,
  MonitorSeveritySchema,
  MonitorStatusSchema,
  MonitorThresholdOperatorSchema,
} from "@langfuse/shared/monitors";

import { __test } from "./MonitorsTable";

const { filterStateToListMonitorFilter, buildStatusToggleUpdate } = __test;

/** monitorFixture builds a full Monitor row with the given status. */
const monitorFixture = (status: Monitor["status"]): Monitor => ({
  id: "mon-1",
  projectId: "project-1",
  view: "observations",
  filters: [],
  metric: { measure: "count", aggregation: "count" },
  window: "5m",
  thresholdOperator: MonitorThresholdOperatorSchema.enum.GT,
  alertThreshold: 10,
  warningThreshold: null,
  noData: { mode: MonitorNoDataModeSchema.enum.SHOW_NO_DATA },
  renotify: { mode: "OFF" },
  name: "My Monitor",
  tags: ["prod"],
  triggerIds: ["t-a"],
  status,
  severity: MonitorSeveritySchema.enum.OK,
  severityChangedAt: null,
  alertedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
  updatedBy: null,
  nextRunAt: new Date(),
  lastPublishedAt: null,
  lastClaimedAt: null,
  lastCompletedAt: null,
});

describe("filterStateToListMonitorFilter", () => {
  it("passes severity `any of` through with values intact", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: [
          MonitorSeveritySchema.enum.ALERT,
          MonitorSeveritySchema.enum.WARNING,
        ],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: [
          MonitorSeveritySchema.enum.ALERT,
          MonitorSeveritySchema.enum.WARNING,
        ],
      },
    ]);
  });

  it("expands NO_DATA to (NO_DATA, UNKNOWN) on the severity column", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: [MonitorSeveritySchema.enum.NO_DATA],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: [
          MonitorSeveritySchema.enum.NO_DATA,
          MonitorSeveritySchema.enum.UNKNOWN,
        ],
      },
    ]);
  });

  it("expands NO_DATA on `none of` too", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "none of",
        value: [MonitorSeveritySchema.enum.NO_DATA],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([
      {
        type: "stringOptions",
        column: "severity",
        operator: "none of",
        value: [
          MonitorSeveritySchema.enum.NO_DATA,
          MonitorSeveritySchema.enum.UNKNOWN,
        ],
      },
    ]);
  });

  it("does not duplicate UNKNOWN when both NO_DATA and UNKNOWN are already present", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: [
          MonitorSeveritySchema.enum.NO_DATA,
          MonitorSeveritySchema.enum.UNKNOWN,
          MonitorSeveritySchema.enum.ALERT,
        ],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: [
          MonitorSeveritySchema.enum.NO_DATA,
          MonitorSeveritySchema.enum.UNKNOWN,
          MonitorSeveritySchema.enum.ALERT,
        ],
      },
    ]);
  });

  it("passes tags rows through unchanged", () => {
    const state: FilterState = [
      {
        type: "arrayOptions",
        column: "tags",
        operator: "any of",
        value: ["prod"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual(state);
  });

  it("collapses to no filter when a row has an unrecognized column", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "bogus",
        operator: "any of",
        value: ["x"],
      },
      {
        type: "arrayOptions",
        column: "tags",
        operator: "any of",
        value: ["prod"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([]);
  });

  it("collapses to no filter when a column is duplicated", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: [MonitorSeveritySchema.enum.ALERT],
      },
      {
        type: "stringOptions",
        column: "severity",
        operator: "none of",
        value: [MonitorSeveritySchema.enum.PAUSED],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([]);
  });
});

describe("buildStatusToggleUpdate", () => {
  it("ACTIVE monitor: flips status to PAUSED", () => {
    expect(
      buildStatusToggleUpdate(monitorFixture(MonitorStatusSchema.enum.ACTIVE))
        .status,
    ).toBe(MonitorStatusSchema.enum.PAUSED);
  });

  it("PAUSED monitor: flips status to ACTIVE", () => {
    expect(
      buildStatusToggleUpdate(monitorFixture(MonitorStatusSchema.enum.PAUSED))
        .status,
    ).toBe(MonitorStatusSchema.enum.ACTIVE);
  });

  it("carries the full config so only status changes", () => {
    const monitor = monitorFixture(MonitorStatusSchema.enum.ACTIVE);
    expect(buildStatusToggleUpdate(monitor)).toEqual({
      id: monitor.id,
      projectId: monitor.projectId,
      view: monitor.view,
      filters: monitor.filters,
      metric: monitor.metric,
      window: monitor.window,
      thresholdOperator: monitor.thresholdOperator,
      alertThreshold: monitor.alertThreshold,
      warningThreshold: monitor.warningThreshold,
      noData: monitor.noData,
      renotify: monitor.renotify,
      name: monitor.name,
      tags: monitor.tags,
      triggerIds: monitor.triggerIds,
      status: MonitorStatusSchema.enum.PAUSED,
    });
  });
});
