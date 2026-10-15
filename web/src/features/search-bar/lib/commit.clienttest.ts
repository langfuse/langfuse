// @vitest-environment node

import { planCommit } from "@/src/features/search-bar/lib/commit";
import { __test } from "@/src/features/search-bar/hooks/useEventsSearchBar";
import { filterStateToQueryText } from "./filter-state-to-query";
import { createFieldRegistry, EVENTS_FIELD_REGISTRY } from "./fields";
import type { FilterState } from "@langfuse/shared";

const experimentAndEvalExclusions = [
  {
    column: "environment",
    type: "string",
    operator: "does not contain",
    value: "langfuse-",
  },
  {
    column: "environment",
    type: "stringOptions",
    operator: "none of",
    value: ["sdk-experiment"],
  },
  {
    column: "experimentId",
    type: "null",
    operator: "is null",
    value: "",
  },
] as const;

describe("planCommit", () => {
  it("preserves skipped experiment occurrences when editing the same score on another target", () => {
    const registry = createFieldRegistry({
      ...EVENTS_FIELD_REGISTRY,
      targeting: {
        defaultTarget: "all",
        supports: () => true,
        targets: [{ id: "all", label: "all", keyword: true }],
      },
    });
    const missingExperimentFilters: FilterState = [
      {
        type: "numberObject",
        column: "scores_avg",
        key: "quality",
        operator: ">",
        value: 0.5,
        target: "missing-run",
      },
      {
        type: "numberObject",
        column: "scores_avg",
        key: "quality",
        operator: "<",
        value: 0.9,
        target: "missing-run",
      },
    ];
    const { skippedFilters } = filterStateToQueryText(
      missingExperimentFilters,
      {},
      registry,
    );
    expect(skippedFilters).toEqual(missingExperimentFilters);
    const result = planCommit("scores.quality:>0.8", undefined, registry);
    expect(result.status).toBe("committed");
    if (result.status !== "committed") throw new Error("Expected commit");

    expect(__test.mergeSkippedFilters(result.filters, skippedFilters)).toEqual([
      ...result.filters,
      ...missingExperimentFilters,
    ]);
  });

  it("replaces a hidden filter when its target, column, and key are explicitly edited", () => {
    const hidden = [
      {
        type: "stringObject",
        column: "metadata",
        key: "region",
        operator: "does not contain",
        value: "old",
        target: "run-a",
      },
    ] satisfies FilterState;
    const edited: FilterState = [{ ...hidden[0], value: "new" }];
    expect(__test.mergeSkippedFilters(edited, hidden)).toEqual(edited);
  });

  it("lowers a valid draft to filters + search + canonical text", () => {
    const r = planCommit("  level:ERROR timeout  ");
    expect(r.status).toBe("committed");
    if (r.status !== "committed") return;
    expect(r.filters).toEqual([
      {
        type: "stringOptions",
        column: "level",
        operator: "any of",
        value: ["ERROR"],
      },
    ]);
    expect(r.searchQuery).toBe("timeout");
    // Bare free text uses the default scope: ids+names+input+output.
    expect(r.searchType).toEqual(["id", "content"]);
    // Canonical text preserves the parsed (typed) order.
    expect(r.canonical).toBe("level:ERROR timeout");
  });

  it("applies the default searchType (ids+names+input+output)", () => {
    const r = planCommit("level:ERROR");
    expect(r.status).toBe("committed");
    if (r.status !== "committed") return;
    expect(r.searchType).toEqual(["id", "content"]);
    expect(r.searchQuery).toBeNull();
  });

  it("treats an empty draft as a committed empty query", () => {
    const r = planCommit("   ");
    expect(r.status).toBe("committed");
    if (r.status !== "committed") return;
    expect(r.filters).toEqual([]);
    expect(r.searchQuery).toBeNull();
    expect(r.canonical).toBe("");
  });

  it("commits the explicit experiment and evaluation exclusions", () => {
    const r = planCommit(
      "-environment:*langfuse-* -environment:sdk-experiment -has:experimentId",
    );
    expect(r.status).toBe("committed");
    if (r.status !== "committed") return;
    expect(r.filters).toEqual(experimentAndEvalExclusions);
    expect(r.searchQuery).toBeNull();
    expect(r.canonical).toBe(
      "-environment:*langfuse-* -environment:sdk-experiment -has:experimentId",
    );
  });

  it("returns invalid with diagnostics for unrepresentable queries", () => {
    const r = planCommit("level:ERROR OR env:dev");
    expect(r.status).toBe("invalid");
    if (r.status !== "invalid") return;
    expect(r.diagnostics.length).toBeGreaterThan(0);
  });

  it("blocks commit when validation and lowering disagree (score-type parity)", () => {
    // `accuracy` is a numeric score, so `accuracy:hello` can't lower. The
    // validity check must see the same scoreTypes the lowering does — otherwise
    // it commits an empty filter set and the user's input silently vanishes.
    const scoreTypes = {
      numericScoreNames: new Set<string>(["accuracy"]),
      categoricalScoreNames: new Set<string>(),
      traceNumericScoreNames: new Set<string>(),
      traceCategoricalScoreNames: new Set<string>(),
    };
    const r = planCommit("scores.accuracy:hello", scoreTypes);
    expect(r.status).toBe("invalid");
  });
});
