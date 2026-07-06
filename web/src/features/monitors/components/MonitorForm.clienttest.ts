import { describe, expect, it } from "vitest";

import {
  CreateMonitorSchema,
  ErrorAtLeastOneTrigger,
  type Monitor,
  MonitorNoDataModeSchema,
  MonitorSeveritySchema,
  MonitorStatusSchema,
  MonitorThresholdOperatorSchema,
} from "@langfuse/shared/monitors";

import {
  getWidgetColumnsWithCustomSelect,
  getWidgetFilterColumns,
} from "@/src/features/widgets/components/widgetFilterColumns";

import { __test } from "./MonitorForm";

const {
  createDefaults,
  monitorToDefaults,
  nameOrPlaceholder,
  buildFilterColumnsParams,
} = __test;

describe("createDefaults", () => {
  it("only surfaces name + alertThreshold as missing base fields (no hidden missing fields)", () => {
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

  it("requires at least one automation once the base fields parse", () => {
    const defaults = createDefaults("project-1");
    const result = CreateMonitorSchema.safeParse({
      ...defaults,
      name: "Test Monitor",
      alertThreshold: 5,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const issue = result.error.issues.find(
      (i) => i.path.join(".") === "triggerIds",
    );
    expect(issue?.message).toBe(ErrorAtLeastOneTrigger);
  });

  it("becomes schema-valid once name + alertThreshold + an automation are filled in", () => {
    const defaults = createDefaults("project-1");
    const result = CreateMonitorSchema.safeParse({
      ...defaults,
      name: "Test Monitor",
      alertThreshold: 5,
      triggerIds: ["t1"],
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

describe("nameOrPlaceholder", () => {
  const placeholder = "Count of Observations > 0";

  it("empty string: falls back to the placeholder", () => {
    expect(nameOrPlaceholder("", placeholder)).toBe(placeholder);
  });

  it("undefined: falls back to the placeholder", () => {
    expect(nameOrPlaceholder(undefined, placeholder)).toBe(placeholder);
  });

  it("whitespace-only: preserved as typed, not the placeholder", () => {
    expect(nameOrPlaceholder("  ", placeholder)).toBe("  ");
  });

  it("non-blank name: wins over the placeholder", () => {
    expect(nameOrPlaceholder("My Monitor", placeholder)).toBe("My Monitor");
  });
});

describe("buildFilterColumnsParams", () => {
  // A monitor's filter-option discovery is scoped to its (default 5m) evaluation
  // window, so it is often empty — the whole point of an alert like
  // "type=TOOL AND level=ERROR" is to catch events that have NOT happened yet.
  // Type and Level are closed enums and their value pickers are not searchable
  // (no free-text fallback), so they must list every domain value regardless of
  // what the discovery window returned, otherwise they dead-end on
  // "No results found" (LFE-10616).
  const getColumn = (view: "observations", id: string) => {
    const params = buildFilterColumnsParams({
      view,
      filterOptions: undefined, // empty discovery window
      datasets: undefined,
    });
    return getWidgetFilterColumns(params).find((c) => c.id === id);
  };

  it("offers every Observation Type value even when discovery data is empty", () => {
    const typeColumn = getColumn("observations", "type");
    expect(typeColumn?.type).toBe("stringOptions");
    const values =
      typeColumn?.type === "stringOptions"
        ? typeColumn.options.map((o) => o.value)
        : [];
    expect(values).toContain("TOOL");
    expect(values).toContain("GENERATION");
    expect(values.length).toBeGreaterThan(0);
  });

  it("offers every Observation Level value even when discovery data is empty", () => {
    const levelColumn = getColumn("observations", "level");
    expect(levelColumn?.type).toBe("stringOptions");
    const values =
      levelColumn?.type === "stringOptions"
        ? levelColumn.options.map((o) => o.value)
        : [];
    expect(values).toContain("ERROR");
    expect(values).toContain("WARNING");
    expect(values.length).toBeGreaterThan(0);
  });

  it("keeps Type/Level as non-searchable columns (they rely on complete option lists)", () => {
    // Confirms the fix must be complete enum lists: Type/Level are NOT custom
    // (searchable/free-text) selects, so an empty option list is a hard dead-end.
    const params = buildFilterColumnsParams({
      view: "observations",
      filterOptions: undefined,
      datasets: undefined,
    });
    const custom = getWidgetColumnsWithCustomSelect(params);
    expect(custom).not.toContain("type");
    expect(custom).not.toContain("level");
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
      thresholdOperator: MonitorThresholdOperatorSchema.enum.GT,
      alertThreshold: 10,
      warningThreshold: null,
      noData: { mode: MonitorNoDataModeSchema.enum.SHOW_NO_DATA },
      renotify: { mode: "OFF" },
      name: "My Monitor",
      tags: [],
      triggerIds: ["t-a", "t-b"],
      status: MonitorStatusSchema.enum.ACTIVE,
      severity: MonitorSeveritySchema.enum.UNKNOWN,
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
    };
    const defaults = monitorToDefaults(monitor);
    expect(defaults.triggerIds).toEqual(["t-a", "t-b"]);
  });
});
