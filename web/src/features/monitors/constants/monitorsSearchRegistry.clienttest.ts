import { describe, expect, it } from "vitest";
import { getMonitorFilterConfig } from "@/src/features/filters/config/monitors-config";
import { monitorsFieldRegistry } from "./monitorsSearchRegistry";
import { astToFilterState } from "@/src/features/search-bar/lib/adapter";
import { planCommit } from "@/src/features/search-bar/lib/commit";
import { parse } from "@/src/features/search-bar/lib/langQ";
import { validateQuery } from "@/src/features/search-bar/lib/validate";
import { createSearchBarStore } from "@/src/features/search-bar/store/searchBarStore";
import { ListMonitorFilterSchema } from "@langfuse/shared/monitors";

const registry = monitorsFieldRegistry(getMonitorFilterConfig(true));

describe("monitor search contract", () => {
  it.each([
    "severity:ALERT -severity:PAUSED",
    "severity:INVALID",
    "has:severity",
  ])("rejects a filter shape the monitor backend cannot apply: %s", (query) => {
    const parsed = parse(query, registry);
    expect(
      astToFilterState(parsed.ast, undefined, registry).errors.length,
    ).toBeGreaterThan(0);
    expect(validateQuery(query, undefined, registry).valid).toBe(false);
    expect(planCommit(query, undefined, registry).status).toBe("invalid");
    const store = createSearchBarStore(undefined, () => registry);
    store.getState().actions.setDraft(query);
    expect(store.getState().draftValid).toBe(false);
  });
  it("keeps grouped severity, evaluator and all-of tags in the existing backend schema", () => {
    const result = planCommit(
      "severity:(ALERT OR WARNING) evaluator:eval-1 tags:(prod AND critical)",
      undefined,
      registry,
    );
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    expect(ListMonitorFilterSchema.safeParse(result.filters).success).toBe(
      true,
    );
    expect(result.filters).toEqual([
      {
        column: "severity",
        type: "stringOptions",
        operator: "any of",
        value: ["ALERT", "WARNING"],
      },
      {
        column: "evaluatorId",
        type: "stringOptions",
        operator: "any of",
        value: ["eval-1"],
      },
      {
        column: "tags",
        type: "arrayOptions",
        operator: "all of",
        value: ["prod", "critical"],
      },
    ]);
  });
  it("offers evaluator filters only on the sidebar that owns the facet", () => {
    const scoped = monitorsFieldRegistry(getMonitorFilterConfig(false));
    expect(planCommit("evaluator:eval-1", undefined, scoped).status).toBe(
      "invalid",
    );
    expect(planCommit("name:alert", undefined, registry).status).toBe(
      "invalid",
    );
  });
});
