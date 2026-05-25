import { describe, expect, it } from "vitest";

import { __test } from "./MonitorAutomationsPanel";

const {
  emittableSeverities,
  triggerSeverityClause,
  buildFilterPreset,
  automationCreateHref,
} = __test;

describe("emittableSeverities", () => {
  it("always includes alert + ok", () => {
    expect(emittableSeverities(null, "SILENT")).toEqual(["alert", "ok"]);
  });

  it("adds warning when warningThreshold is set", () => {
    expect(emittableSeverities(5, "SILENT")).toEqual([
      "alert",
      "ok",
      "warning",
    ]);
  });

  it("adds no-data when noData.mode is NOTIFY", () => {
    expect(emittableSeverities(null, "NOTIFY")).toEqual([
      "alert",
      "ok",
      "no-data",
    ]);
  });

  it("includes both warning and no-data when configured", () => {
    expect(emittableSeverities(5, "NOTIFY")).toEqual([
      "alert",
      "ok",
      "warning",
      "no-data",
    ]);
  });
});

describe("triggerSeverityClause", () => {
  it("returns null when no severity clause is present", () => {
    expect(
      triggerSeverityClause([
        {
          column: "tags",
          type: "arrayOptions",
          operator: "all of",
          value: ["prod"],
        },
      ]),
    ).toBeNull();
  });

  it("returns the allowed severities from a stringOptions `any of` clause", () => {
    expect(
      triggerSeverityClause([
        {
          column: "severity",
          type: "stringOptions",
          operator: "any of",
          value: ["alert", "warning"],
        },
      ]),
    ).toEqual(["alert", "warning"]);
  });

  it("ignores severity clauses with other operators", () => {
    expect(
      triggerSeverityClause([
        {
          column: "severity",
          type: "stringOptions",
          operator: "none of",
          value: ["alert"],
        },
      ]),
    ).toBeNull();
  });
});

describe("buildFilterPreset", () => {
  it("emits monitorId, monitorName, and tags filters when all are present", () => {
    const preset = buildFilterPreset({
      monitorId: "mon_01",
      name: "Latency monitor",
      tags: ["prod", "web"],
    });
    expect(preset).toEqual([
      {
        column: "monitorId",
        type: "stringOptions",
        operator: "any of",
        value: ["mon_01"],
      },
      {
        column: "monitorName",
        type: "string",
        operator: "=",
        value: "Latency monitor",
      },
      {
        column: "tags",
        type: "arrayOptions",
        operator: "all of",
        value: ["prod", "web"],
      },
    ]);
  });

  it("omits monitorId when undefined and the name clause when name is blank", () => {
    expect(
      buildFilterPreset({ monitorId: undefined, name: "  ", tags: ["prod"] }),
    ).toEqual([
      {
        column: "tags",
        type: "arrayOptions",
        operator: "all of",
        value: ["prod"],
      },
    ]);
  });

  it("returns an empty FilterState when nothing is set", () => {
    expect(
      buildFilterPreset({ monitorId: undefined, name: "", tags: [] }),
    ).toEqual([]);
  });
});

describe("automationCreateHref", () => {
  it("includes view=create, source=monitor, and a urlencoded filterPreset", () => {
    const href = automationCreateHref("proj_01", [
      {
        column: "tags",
        type: "arrayOptions",
        operator: "all of",
        value: ["prod"],
      },
    ]);
    expect(href).toContain("/project/proj_01/automations");
    expect(href).toContain("view=create");
    expect(href).toContain("source=monitor");
    const search = new URLSearchParams(href.split("?")[1] ?? "");
    expect(JSON.parse(search.get("filterPreset") ?? "")).toEqual([
      {
        column: "tags",
        type: "arrayOptions",
        operator: "all of",
        value: ["prod"],
      },
    ]);
  });

  it("adds actionType in SCREAMING_SNAKE wire form when provided", () => {
    expect(automationCreateHref("proj_01", [], "SLACK")).toContain(
      "actionType=SLACK",
    );
    expect(automationCreateHref("proj_01", [], "WEBHOOK")).toContain(
      "actionType=WEBHOOK",
    );
    expect(automationCreateHref("proj_01", [], "GITHUB_DISPATCH")).toContain(
      "actionType=GITHUB_DISPATCH",
    );
  });
});
