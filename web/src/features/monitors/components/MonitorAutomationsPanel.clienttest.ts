import { describe, expect, it } from "vitest";

import { __test } from "./MonitorAutomationsPanel";

const {
  emittableSeverities,
  triggerSeverityClause,
  buildFilterPreset,
  automationCreateHref,
} = __test;

describe("emittableSeverities", () => {
  it("always includes ALERT + OK", () => {
    expect(emittableSeverities(null, "SILENT")).toEqual(["ALERT", "OK"]);
  });

  it("adds WARNING when warningThreshold is set", () => {
    expect(emittableSeverities(5, "SILENT")).toEqual([
      "ALERT",
      "OK",
      "WARNING",
    ]);
  });

  it("adds NO_DATA when noData.mode is NOTIFY", () => {
    expect(emittableSeverities(null, "NOTIFY")).toEqual([
      "ALERT",
      "OK",
      "NO_DATA",
    ]);
  });

  it("includes both WARNING and NO_DATA when configured", () => {
    expect(emittableSeverities(5, "NOTIFY")).toEqual([
      "ALERT",
      "OK",
      "WARNING",
      "NO_DATA",
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
          value: ["ALERT", "WARNING"],
        },
      ]),
    ).toEqual(["ALERT", "WARNING"]);
  });

  it("ignores severity clauses with other operators", () => {
    expect(
      triggerSeverityClause([
        {
          column: "severity",
          type: "stringOptions",
          operator: "none of",
          value: ["ALERT"],
        },
      ]),
    ).toBeNull();
  });
});

describe("buildFilterPreset", () => {
  it("emits a tags clause when tags are present", () => {
    expect(buildFilterPreset(["prod", "web"])).toEqual([
      {
        column: "tags",
        type: "arrayOptions",
        operator: "all of",
        value: ["prod", "web"],
      },
    ]);
  });

  it("returns an empty FilterState when no tags are set", () => {
    expect(buildFilterPreset([])).toEqual([]);
  });
});

/** decodePrefill mirrors the form-side base64url decoder so tests can assert on the typed payload. */
const decodePrefill = (href: string): unknown => {
  const search = new URLSearchParams(href.split("?")[1] ?? "");
  const blob = search.get("prefill") ?? "";
  const padded = blob.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(padded));
};

describe("automationCreateHref", () => {
  it("emits view=create and a single base64url prefill blob", () => {
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
    expect(decodePrefill(href)).toEqual({
      eventSource: "monitor",
      filter: [
        {
          column: "tags",
          type: "arrayOptions",
          operator: "all of",
          value: ["prod"],
        },
      ],
    });
  });

  it("omits the filter clause from the prefill when no tags are set", () => {
    expect(decodePrefill(automationCreateHref("proj_01", []))).toEqual({
      eventSource: "monitor",
    });
  });

  it("includes actionType in the prefill payload when provided", () => {
    expect(decodePrefill(automationCreateHref("proj_01", [], "SLACK"))).toEqual(
      { eventSource: "monitor", actionType: "SLACK" },
    );
    expect(
      decodePrefill(automationCreateHref("proj_01", [], "WEBHOOK")),
    ).toEqual({ eventSource: "monitor", actionType: "WEBHOOK" });
    expect(
      decodePrefill(automationCreateHref("proj_01", [], "GITHUB_DISPATCH")),
    ).toEqual({ eventSource: "monitor", actionType: "GITHUB_DISPATCH" });
  });
});
