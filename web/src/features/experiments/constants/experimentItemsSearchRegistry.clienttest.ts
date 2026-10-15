import { describe, expect, it } from "vitest";
import { EXPERIMENT_ITEMS_FIELD_REGISTRY } from "./experimentItemsSearchRegistry";
import { planCommit, filterStateToQueryText } from "@/src/features/search-bar";
import {
  experimentItemsFilterTargeting,
  supportsExperimentItemFilterTarget,
} from "../lib/experimentItemsFilterTargeting";
import { scoreTypeContextFromObserved } from "@/src/features/search-bar/lib/observed-options";
import { draftsSemanticallyEqual } from "@/src/features/search-bar/store/searchBarStore";

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
  it("preserves backend-specific metadata filters without emitting a generic metadata column", () => {
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
    const query = filterStateToQueryText(
      filters,
      undefined,
      EXPERIMENT_ITEMS_FIELD_REGISTRY,
    );
    expect(query.skippedFilters).toEqual([]);
    expect(query.text).toBe(
      "itemMetadata.language:en eventMetadata.model:test",
    );
    expect(
      planCommit(query.text, undefined, EXPERIMENT_ITEMS_FIELD_REGISTRY),
    ).toMatchObject({ status: "committed", filters });
    expect(
      planCommit(
        "metadata.language:en",
        undefined,
        EXPERIMENT_ITEMS_FIELD_REGISTRY,
      ).status,
    ).toBe("invalid");
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
      supports: supportsExperimentItemFilterTarget,
    },
  };

  it("targets status conditions independently of scores", () => {
    const result = planCommit(
      'level:ERROR @"Claude Sonnet" scores.quality:>0.8',
      undefined,
      registry,
    );
    expect(result).toMatchObject({
      status: "committed",
      filters: [
        { column: "level", target: "run-b" },
        { column: "scores_avg", key: "quality", target: "baseline" },
      ],
    });
    if (result.status !== "committed") throw new Error("Expected valid query");
    const query = filterStateToQueryText(result.filters, undefined, registry);
    expect(query.skippedFilters).toEqual([]);
    expect(planCommit(query.text, undefined, registry)).toMatchObject({
      filters: result.filters,
    });
    expect(decodeFiltersGeneric(encodeFiltersGeneric(result.filters))).toEqual(
      result.filters,
    );
    expect(
      groupExperimentFilters(result.filters, "run-a", ["run-a", "run-b"])
        .groups,
    ).toMatchObject([
      { runId: "run-b", filters: [{ column: "level" }] },
      { runId: "run-a", filters: [{ column: "scores_avg" }] },
    ]);
    const input = "level:ERROR @";
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
    expect(text).toContain('"Claude Sonnet".scores.');
    expect(text).toContain("baseline.scores.");
    expect(result.canonical).toContain('"Claude Sonnet".scores.');
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
    const option = flattenOptions(plan).find((o) => o.id === "target:run-b");
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

describe("comparison target identity and options", () => {
  const experiments = [
    { experimentId: "run-a", experimentName: "Run A", datasetName: "Examples" },
    { experimentId: "run-b", experimentName: "Run B", datasetName: "Examples" },
  ];
  const registryFor = (runs = experiments) => ({
    ...EXPERIMENT_ITEMS_FIELD_REGISTRY,
    targeting: experimentItemsFilterTargeting({
      baselineId: "run-a",
      experiments: runs,
      colorExperimentIds: runs.map((run) => run.experimentId),
    }),
  });

  it("defaults new filters to all while preserving old targetless URL filters on baseline", () => {
    const registry = registryFor();
    const result = planCommit(
      "level:ERROR scores.quality:>0.8 itemMetadata.region:eu",
      undefined,
      registry,
    );
    expect(result).toMatchObject({
      status: "committed",
      filters: [
        { column: "level", target: "all" },
        { column: "scores_avg", target: "all" },
        { column: "itemMetadata", target: "all" },
      ],
    });
    const legacy: FilterState = [
      {
        type: "numberObject",
        column: "scores_avg",
        key: "quality",
        operator: ">",
        value: 0.8,
      },
    ];
    const persisted = decodeFiltersGeneric(encodeFiltersGeneric(legacy));
    expect(filterStateToQueryText(persisted, {}, registry).text).toBe(
      "baseline.scores.quality:>0.8",
    );
    expect(
      registry.targeting.targets.slice(0, 2).map((target) => target.id),
    ).toEqual(["all", "baseline"]);
  });

  it.each([
    ["has:itemMetadata.region", "all", "itemMetadata", "is set"],
    ["-has:itemMetadata.region", "all", "itemMetadata", "is not set"],
    [
      "baseline.has:eventMetadata.region",
      "baseline",
      "eventMetadata",
      "is set",
    ],
    [
      "-baseline.has:eventMetadata.region",
      "baseline",
      "eventMetadata",
      "is not set",
    ],
    ['"Run B".has:itemMetadata.region', "run-b", "itemMetadata", "is set"],
    [
      '-"Run B".has:eventMetadata.region',
      "run-b",
      "eventMetadata",
      "is not set",
    ],
  ])("round-trips metadata presence: %s", (query, target, column, operator) => {
    const registry = registryFor();
    const result = planCommit(query, undefined, registry);
    expect(result).toMatchObject({
      status: "committed",
      filters: [
        {
          type: "stringObject",
          column,
          key: "region",
          operator,
          value: "",
          target,
        },
      ],
    });
    if (result.status !== "committed")
      throw new Error("Expected valid presence filter");
    const reversed = filterStateToQueryText(result.filters, {}, registry);
    expect(reversed.skippedFilters).toEqual([]);
    expect(reversed.text).toBe(query);
    expect(planCommit(reversed.text, undefined, registry)).toMatchObject({
      filters: result.filters,
    });
    const plan = planInputCompletions(
      {
        input: query,
        caret: query.length,
        observed: {},
        recents: [],
        currentQueryText: query,
      },
      registry,
    );
    expect(
      flattenOptions(plan).some((option) => option.id === "target:run-a"),
    ).toBe(true);
  });

  it("preserves quoted metadata keys in presence predicates", () => {
    const registry = registryFor();
    const result = planCommit(
      'baseline.has:itemMetadata."source: name"',
      undefined,
      registry,
    );
    expect(result).toMatchObject({
      status: "committed",
      filters: [
        { key: "source: name", target: "baseline", operator: "is set" },
      ],
    });
    if (result.status !== "committed")
      throw new Error("Expected valid presence filter");
    expect(
      planCommit(
        filterStateToQueryText(result.filters, {}, registry).text,
        undefined,
        registry,
      ),
    ).toMatchObject({ filters: result.filters });
  });

  it.each([
    ["Dataset A", "Dataset B"],
    ["Dataset A", "Dataset A"],
  ])(
    "round-trips duplicate names across %s and %s",
    (firstDataset, secondDataset) => {
      const runs = experiments.map((run, index) => ({
        ...run,
        experimentName: "Repeated run",
        datasetName: index === 0 ? firstDataset : secondDataset,
      }));
      const registry = registryFor(runs);
      const targets = registry.targeting.targets.filter(
        (target) => !target.keyword,
      );
      expect(new Set(targets.map((target) => target.label)).size).toBe(2);
      for (const target of targets) {
        const result = planCommit(
          `${JSON.stringify(target.label)}.scores.quality:>0.8`,
          undefined,
          registry,
        );
        expect(result).toMatchObject({
          status: "committed",
          filters: [{ target: target.id }],
        });
        if (result.status !== "committed")
          throw new Error("Expected valid target");
        expect(
          planCommit(
            filterStateToQueryText(result.filters, {}, registry).text,
            undefined,
            registry,
          ),
        ).toMatchObject({ filters: result.filters });
      }
      expect(
        planCommit('"Repeated run".level:ERROR', undefined, registry).status,
      ).toBe("invalid");
    },
  );

  it("keeps a pinned URL target when its experiment is renamed", () => {
    const result = planCommit('"Run B".level:ERROR', undefined, registryFor());
    if (result.status !== "committed") throw new Error("Expected valid target");
    const renamed = registryFor(
      experiments.map((run) => ({
        ...run,
        experimentName: `${run.experimentName} renamed`,
      })),
    );
    const filters = decodeFiltersGeneric(encodeFiltersGeneric(result.filters));
    const query = filterStateToQueryText(filters, {}, renamed);
    expect(query.text).toBe('"Run B renamed".level:ERROR');
    expect(planCommit(query.text, undefined, renamed)).toMatchObject({
      filters: result.filters,
    });
  });

  it("changes score type and suggestions with the selected experiment", () => {
    const numeric = {
      scores_avg: [{ value: "rating" }],
      score_categories: [],
      score_booleans: [],
    };
    const categorical = {
      scores_avg: [],
      score_categories: [{ value: "rating" }],
      score_booleans: [],
      "score_categories.rating": [{ value: "2.0" }, { value: "good" }],
    };
    const optionsFor = (target: string) =>
      target === "run-b" ? categorical : numeric;
    const registry = {
      ...EXPERIMENT_ITEMS_FIELD_REGISTRY,
      targeting: experimentItemsFilterTargeting({
        baselineId: "run-a",
        experiments,
        colorExperimentIds: ["run-a", "run-b"],
        observedForTarget: optionsFor,
        scoreTypesForTarget: (target) =>
          scoreTypeContextFromObserved(optionsFor(target)),
      }),
    };
    const input = '"Run A".scores.rating:2.0';
    const p = planInputCompletions(
      {
        input,
        caret: input.length,
        observed: numeric,
        recents: [],
        currentQueryText: input,
      },
      registry,
    )!;
    const target = flattenOptions(p).find(
      (option) => option.id === "target:run-b",
    )!;
    if (target.kind !== "pattern")
      throw new Error("Expected experiment option");
    const { next } = applyPick(target, input, p);
    expect(
      planCommit(next, scoreTypeContextFromObserved(numeric), registry),
    ).toMatchObject({
      status: "committed",
      filters: [
        { column: "score_categories", value: ["2.0"], target: "run-b" },
      ],
    });
    const categoryInput = '"Run B".scores.rating:';
    const categories = planInputCompletions(
      {
        input: categoryInput,
        caret: categoryInput.length,
        observed: numeric,
        recents: [],
        currentQueryText: categoryInput,
      },
      registry,
    );
    expect(
      flattenOptions(categories)
        .filter((option) => option.kind === "value")
        .map((option) => option.label),
    ).toEqual(["2.0", "good"]);
    expect(
      draftsSemanticallyEqual(
        '"Run B".scores.rating:2.0',
        '"Run B".scores.rating:2',
        scoreTypeContextFromObserved(numeric),
        registry,
      ),
    ).toBe(false);
  });
});
