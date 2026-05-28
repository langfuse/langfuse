import { describe, expect, it } from "vitest";

import { CreateMonitorSchema, type Monitor } from "@langfuse/shared/monitors";

import { __test } from "./MonitorForm";

const { createDefaults, monitorToDefaults } = __test;

describe("createDefaults", () => {
  it("only forces the user to enter name + alertThreshold (no hidden missing fields)", () => {
    const defaults = createDefaults("project-1");
    const result = CreateMonitorSchema.safeParse(defaults);
    expect(result.success).toBe(false);
    if (result.success) return;

    const paths = result.error.issues.map((i) => i.path.join("."));
    expect(paths).toContain("name");
    expect(paths).toContain("alertThreshold");
    // Anything else has no error UI in the form, so the submit would silently
    // reject and the user would see the create button "do nothing". Defaults
    // must cover these fields with schema-valid values.
    expect(paths).not.toContain("warningThreshold");
    expect(paths).not.toContain("filters");
    expect(paths).not.toContain("tags");
  });

  it("becomes schema-valid once name + alertThreshold are filled in", () => {
    const defaults = createDefaults("project-1");
    const result = CreateMonitorSchema.safeParse({
      ...defaults,
      name: "Test Monitor",
      alertThreshold: 5,
    });
    if (!result.success) {
      throw new Error(
        `expected schema-valid, got: ${JSON.stringify(result.error.issues, null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("triggerIds defaults to empty array", () => {
    const defaults = createDefaults("project-1");
    expect(defaults.triggerIds).toEqual([]);
  });
});

describe("monitorToDefaults", () => {
  it("maps monitor.triggerIds into the form defaults", () => {
    const monitor: Monitor = {
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
      tags: [],
      triggerIds: ["t-a", "t-b"],
      status: "ACTIVE",
      severity: "UNKNOWN",
      severityChangedAt: null,
      alertedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: null,
      updatedBy: null,
      nextRunAt: new Date(),
      lastPublishedRunAt: null,
      lastCompletedRunAt: null,
    };
    const defaults = monitorToDefaults(monitor);
    expect(defaults.triggerIds).toEqual(["t-a", "t-b"]);
  });
});
