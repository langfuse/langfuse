import { describe, expect, it } from "vitest";
import { EXPERIMENT_ITEMS_FIELD_REGISTRY } from "./experimentItemsSearchRegistry";
import { planCommit, filterStateToQueryText } from "@/src/features/search-bar";

import {
  singleFilterList,
  encodeFiltersGeneric,
  decodeFiltersGeneric,
  type FilterState,
} from "@langfuse/shared";
import { groupExperimentFilters } from "../lib/experimentFilterTargets";
import { deriveComposerSegments } from "@/src/features/search-bar/lib/composer-segments";
import { removeToken } from "@/src/features/search-bar/lib/edits";
import {
  applyPick,
  flattenOptions,
  planInputCompletions,
} from "@/src/features/search-bar/lib/completions";
import { applyKeyedFilterEntries } from "@/src/features/filters/lib/sidebar-filter-actions";

describe("experiment item search contract", () => {
  it("lowers root/trace score conditions to the same canonical columns as the sidebar", () => {
    const result = planCommit(
      "status:ERROR scores.quality:>0.8",
      undefined,
      EXPERIMENT_ITEMS_FIELD_REGISTRY,
    );
    expect(result).toMatchObject({
      status: "committed",
      filters: [
        {
          column: "level",
          type: "stringOptions",
          operator: "any of",
          value: ["ERROR"],
        },
        {
          column: "scores_avg",
          type: "numberObject",
          key: "quality",
          operator: ">",
          value: 0.8,
        },
      ],
    });
  });
  it("maps each metadata namespace to its own backend column", () => {
    const filters: FilterState = [
      {
        column: "itemMetadata",
        type: "stringObject",
        key: "language",
        operator: "=",
        value: "en",
      },
      {
        column: "eventMetadata",
        type: "stringObject",
        key: "model",
        operator: "=",
        value: "test",
      },
    ];
    const result = filterStateToQueryText(
      filters,
      undefined,
      EXPERIMENT_ITEMS_FIELD_REGISTRY,
    );
    expect(result.skippedFilters).toEqual([]);
    expect(result.text).toContain("itemMetadata.language");
    expect(result.text).toContain("eventMetadata.model");
    expect(
      planCommit(result.text, undefined, EXPERIMENT_ITEMS_FIELD_REGISTRY),
    ).toMatchObject({
      status: "committed",
      filters,
    });
    expect(
      planCommit(
        "traceScores.quality:1",
        undefined,
        EXPERIMENT_ITEMS_FIELD_REGISTRY,
      ).status,
    ).toBe("invalid");
  });
});

describe("experiment filter targets", () => {
  const registry = {
    ...EXPERIMENT_ITEMS_FIELD_REGISTRY,
    targeting: {
      defaultTarget: "baseline",
      targets: [
        { id: "baseline", label: "baseline", keyword: true },
        { id: "run-b", label: "Claude Sonnet", textClassName: "text-pink-500" },
      ],
      supports: () => true,
    },
  };

  it("targets status and both metadata namespaces, including key presence", () => {
    const result = planCommit(
      'level:ERROR @"Claude Sonnet" itemMetadata.language:en eventMetadata.model:test @"Claude Sonnet" has:itemMetadata.version @baseline',
      undefined,
      registry,
    );
    expect(result).toMatchObject({
      status: "committed",
      filters: [
        { column: "level", target: "run-b" },
        { column: "itemMetadata", key: "language", target: "baseline" },
        { column: "eventMetadata", key: "model", target: "run-b" },
        {
          column: "itemMetadata",
          key: "version",
          operator: "is set",
          target: "baseline",
        },
      ],
    });
    if (result.status !== "committed") throw new Error("Expected valid query");
    const query = filterStateToQueryText(result.filters, undefined, registry);
    expect(query.skippedFilters).toEqual([]);
    expect(planCommit(query.text, undefined, registry)).toMatchObject({
      filters: result.filters,
    });
    const restored = decodeFiltersGeneric(encodeFiltersGeneric(result.filters));
    expect(restored).toEqual(result.filters);
    expect(
      groupExperimentFilters(restored, "run-a", ["run-a", "run-b"]).groups,
    ).toMatchObject([
      {
        runId: "run-b",
        filters: [{ column: "level" }, { column: "eventMetadata" }],
      },
      {
        runId: "run-a",
        filters: [{ column: "itemMetadata" }, { column: "itemMetadata" }],
      },
    ]);
    for (const condition of [
      "level:ERROR",
      "itemMetadata.language:en",
      "eventMetadata.model:test",
      "has:itemMetadata.version",
    ]) {
      const input = `${condition} @`;
      expect(
        flattenOptions(
          planInputCompletions(
            {
              input,
              caret: input.length,
              observed: {},
              recents: [],
              currentQueryText: input,
            },
            registry,
          ),
        ).map((option) => option.label),
      ).toEqual(["baseline", "Claude Sonnet"]);
    }
  });

  it("binds targets to conditions and round-trips them through editable text", () => {
    const result = planCommit(
      'scores.quality:>0.8 @"Claude Sonnet" scores.quality:<0.6',
      undefined,
      registry,
    );
    expect(result).toMatchObject({
      status: "committed",
      filters: [
        { key: "quality", target: "run-b", operator: ">" },
        { key: "quality", target: "baseline", operator: "<" },
      ],
    });
    if (result.status !== "committed") throw new Error("Expected valid query");
    const text = filterStateToQueryText(
      result.filters,
      undefined,
      registry,
    ).text;
    expect(text).toContain('@"Claude Sonnet"');
    expect(text).toContain("@baseline");
    expect(result.canonical).toContain('@id:"run-b"');
    expect(decodeFiltersGeneric(encodeFiltersGeneric(result.filters))).toEqual(
      result.filters,
    );
    expect(singleFilterList.parse(result.filters)).toEqual(result.filters);
    const edited = applyKeyedFilterEntries(result.filters, "scores_avg", {
      kind: "numberObject",
      entries: [
        { key: "quality", operator: ">", value: 0.9, target: "run-b" },
        { key: "quality", operator: "<", value: 0.6, target: "baseline" },
      ],
    });
    expect(edited.map((f) => f.target)).toEqual(["run-b", "baseline"]);
    for (const baseline of ["run-a", "run-c"]) {
      expect(
        groupExperimentFilters(edited, baseline, [
          baseline,
          "run-b",
        ]).groups.map((g) => g.runId),
      ).toEqual(["run-b", baseline]);
    }
    expect(
      groupExperimentFilters(edited, "run-a", ["run-a"]).error,
    ).toBeDefined();
    expect(planCommit(text, undefined, registry)).toMatchObject({
      filters: result.filters,
    });
  });

  it("completes the target as part of one editable, removable chip", () => {
    const input = 'scores.quality:>0.8 @"Cl';
    const plan = planInputCompletions(
      {
        input,
        caret: input.length,
        observed: {},
        recents: [],
        currentQueryText: input,
      },
      registry,
    );
    const option = flattenOptions(plan).find((o) => o.kind === "pattern");
    if (!plan || !option || option.kind !== "pattern")
      throw new Error("Missing target suggestion");
    const { next } = applyPick(option, input, plan);
    expect(planCommit(next, undefined, registry)).toMatchObject({
      status: "committed",
      filters: [{ target: "run-b" }],
    });
    const segments = deriveComposerSegments(next, undefined, registry);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      kind: "filter",
      target: { textClassName: "text-pink-500" },
    });
    expect(removeToken(next, segments[0], registry).trim()).toBe("");
    const grouped = "scores.feedback:(good OR great) @";
    expect(
      flattenOptions(
        planInputCompletions(
          {
            input: grouped,
            caret: grouped.length,
            observed: {},
            recents: [],
            currentQueryText: grouped,
          },
          registry,
        ),
      ).map((o) => o.label),
    ).toEqual(["baseline", "Claude Sonnet"]);
    expect(
      planCommit(
        'scores.feedback:a @baseline OR scores.feedback:b @"Claude Sonnet"',
        undefined,
        registry,
      ).status,
    ).toBe("invalid");
  });

  it("rejects unavailable targets and keeps ordinary @ text unchanged", () => {
    expect(
      planCommit("(scores.quality:>0) @baseline", undefined, registry).status,
    ).toBe("invalid");
    expect(
      planCommit('scores.quality:>0 @"missing"', undefined, registry).status,
    ).toBe("invalid");
    expect(
      planCommit("scores.quality:>0 @baseline", undefined, {
        ...registry,
        targeting: { ...registry.targeting, targets: [] },
      }).status,
    ).toBe("invalid");
    expect(
      planCommit(
        'scores.feedback:"a@b.com"',
        undefined,
        EXPERIMENT_ITEMS_FIELD_REGISTRY,
      ),
    ).toMatchObject({
      status: "committed",
      filters: [{ value: ["a@b.com"] }],
    });
  });
});
