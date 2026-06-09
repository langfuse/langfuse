import { describe, expect, it } from "vitest";

import { type FilterState } from "@langfuse/shared";
import { type Monitor } from "@langfuse/shared/monitors";

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
  thresholdOperator: "GT",
  alertThreshold: 10,
  warningThreshold: null,
  noData: { mode: "SILENT" },
  renotify: { mode: "OFF" },
  name: "My Monitor",
  tags: ["prod"],
  triggerIds: ["t-a"],
  status,
  severity: "OK",
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
        value: ["ALERT", "WARNING"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["ALERT", "WARNING"],
      },
    ]);
  });

  it("expands NO_DATA to (NO_DATA, UNKNOWN) on the severity column", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["NO_DATA"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["NO_DATA", "UNKNOWN"],
      },
    ]);
  });

  it("expands NO_DATA on `none of` too", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "none of",
        value: ["NO_DATA"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([
      {
        type: "stringOptions",
        column: "severity",
        operator: "none of",
        value: ["NO_DATA", "UNKNOWN"],
      },
    ]);
  });

  it("does not duplicate UNKNOWN when both NO_DATA and UNKNOWN are already present", () => {
    const state: FilterState = [
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["NO_DATA", "UNKNOWN", "ALERT"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([
      {
        type: "stringOptions",
        column: "severity",
        operator: "any of",
        value: ["NO_DATA", "UNKNOWN", "ALERT"],
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
        value: ["ALERT"],
      },
      {
        type: "stringOptions",
        column: "severity",
        operator: "none of",
        value: ["PAUSED"],
      },
    ];
    expect(filterStateToListMonitorFilter(state)).toEqual([]);
  });
});

describe("buildStatusToggleUpdate", () => {
  it("ACTIVE monitor: flips status to PAUSED", () => {
    expect(buildStatusToggleUpdate(monitorFixture("ACTIVE")).status).toBe(
      "PAUSED",
    );
  });

  it("PAUSED monitor: flips status to ACTIVE", () => {
    expect(buildStatusToggleUpdate(monitorFixture("PAUSED")).status).toBe(
      "ACTIVE",
    );
  });

  it("carries the full config so only status changes", () => {
    const monitor = monitorFixture("ACTIVE");
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
      status: "PAUSED",
    });
  });
});
