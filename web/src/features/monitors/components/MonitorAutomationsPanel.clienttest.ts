import { describe, expect, it } from "vitest";

import { type FilterState } from "@langfuse/shared";

import { __test } from "./MonitorAutomationsPanel";

const {
  triggerTagsClause,
  tagClauseMatches,
  toggleAutomationTags,
  buildFilterPreset,
  automationCreateHref,
} = __test;

describe("triggerTagsClause", () => {
  it("returns the values and operator from an `all of` arrayOptions clause", () => {
    expect(
      triggerTagsClause([
        {
          column: "tags",
          type: "arrayOptions",
          operator: "all of",
          value: ["prod", "web"],
        },
      ]),
    ).toEqual({ values: ["prod", "web"], operator: "all of" });
  });

  it("returns the values and operator from an `any of` arrayOptions clause", () => {
    expect(
      triggerTagsClause([
        {
          column: "tags",
          type: "arrayOptions",
          operator: "any of",
          value: ["prod"],
        },
      ]),
    ).toEqual({ values: ["prod"], operator: "any of" });
  });

  it("returns the values and operator from a `none of` arrayOptions clause", () => {
    expect(
      triggerTagsClause([
        {
          column: "tags",
          type: "arrayOptions",
          operator: "none of",
          value: ["prod"],
        },
      ]),
    ).toEqual({ values: ["prod"], operator: "none of" });
  });

  it("returns null when no tags clause is present", () => {
    expect(
      triggerTagsClause([
        {
          column: "severity",
          type: "stringOptions",
          operator: "any of",
          value: ["ALERT"],
        },
      ]),
    ).toBeNull();
  });

  it("returns null for an empty filter", () => {
    expect(triggerTagsClause([])).toBeNull();
  });
});

describe("tagClauseMatches", () => {
  it("returns true when the filter has no tags clause", () => {
    expect(tagClauseMatches([], [])).toBe(true);
    expect(tagClauseMatches([], ["prod"])).toBe(true);
    expect(
      tagClauseMatches(
        [
          {
            column: "severity",
            type: "stringOptions",
            operator: "any of",
            value: ["ALERT"],
          },
        ],
        ["prod"],
      ),
    ).toBe(true);
  });

  it("requires the monitor tags to be a superset for `all of`", () => {
    const filter = [
      {
        column: "tags",
        type: "arrayOptions",
        operator: "all of",
        value: ["prod", "web"],
      },
    ] satisfies FilterState;
    expect(tagClauseMatches(filter, ["prod", "web", "extra"])).toBe(true);
    expect(tagClauseMatches(filter, ["prod"])).toBe(false);
    expect(tagClauseMatches(filter, [])).toBe(false);
  });

  it("requires at least one matching tag for `any of`", () => {
    const filter = [
      {
        column: "tags",
        type: "arrayOptions",
        operator: "any of",
        value: ["prod", "web"],
      },
    ] satisfies FilterState;
    expect(tagClauseMatches(filter, ["web"])).toBe(true);
    expect(tagClauseMatches(filter, ["staging"])).toBe(false);
    expect(tagClauseMatches(filter, [])).toBe(false);
  });

  it("excludes overlapping tags for `none of`", () => {
    const filter = [
      {
        column: "tags",
        type: "arrayOptions",
        operator: "none of",
        value: ["prod"],
      },
    ] satisfies FilterState;
    expect(tagClauseMatches(filter, ["web"])).toBe(true);
    expect(tagClauseMatches(filter, ["prod", "web"])).toBe(false);
  });
});

describe("toggleAutomationTags", () => {
  it("adds the trigger tags when the row is not currently matched", () => {
    expect(toggleAutomationTags(["prod"], ["web", "api"], false)).toEqual([
      "prod",
      "web",
      "api",
    ]);
  });

  it("dedupes when adding tags that already exist", () => {
    expect(
      toggleAutomationTags(["prod", "web"], ["web", "api"], false),
    ).toEqual(["prod", "web", "api"]);
  });

  it("removes every trigger tag when the row is currently matched", () => {
    expect(
      toggleAutomationTags(["prod", "web", "extra"], ["prod", "web"], true),
    ).toEqual(["extra"]);
  });

  it("removes only the trigger tags that are actually in the current list", () => {
    expect(toggleAutomationTags(["prod"], ["prod", "web"], true)).toEqual([]);
  });

  it("is a no-op when the trigger has no tag clause", () => {
    expect(toggleAutomationTags(["prod"], [], false)).toEqual(["prod"]);
    expect(toggleAutomationTags(["prod"], [], true)).toEqual(["prod"]);
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
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
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

  it("round-trips non-ASCII tags through the prefill encoder", () => {
    const href = automationCreateHref("proj_01", [
      {
        column: "tags",
        type: "arrayOptions",
        operator: "all of",
        value: ["プロダクション", "🚀-prod"],
      },
    ]);
    expect(decodePrefill(href)).toEqual({
      eventSource: "monitor",
      filter: [
        {
          column: "tags",
          type: "arrayOptions",
          operator: "all of",
          value: ["プロダクション", "🚀-prod"],
        },
      ],
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
