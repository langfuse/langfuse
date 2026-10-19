import { describe, expect, it } from "vitest";
import {
  singleFilterList,
  encodeFiltersGeneric,
  decodeFiltersGeneric,
  type FilterState,
} from "@langfuse/shared";
import { EXPERIMENT_ITEMS_FIELD_REGISTRY } from "./experimentItemsSearchRegistry";
import { planCommit, filterStateToQueryText } from "@/src/features/search-bar";
import { experimentItemsFilterTargeting } from "../lib/experimentItemsFilterTargeting";
import {
  completeExperimentFilter,
  experimentFilterToDraft,
} from "../components/filters/experimentFilterEditing";

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
  const experiments = [
    { experimentId: "run-a", experimentName: "Run A" },
    { experimentId: "run-b", experimentName: "Run B" },
  ];
  const registryFor = (baselineId: string | undefined, runs = experiments) => ({
    ...EXPERIMENT_ITEMS_FIELD_REGISTRY,
    targeting: experimentItemsFilterTargeting({
      baselineId,
      experimentIds: ["run-b", "run-a"],
      experiments: runs,
      colorExperimentIds: ["run-a", "run-b"],
    }),
  });

  it("binds sidebar and typed conditions to the same targets and persists their identities", () => {
    const registry = registryFor("run-a");
    const filters: FilterState = [
      {
        column: "scores_avg",
        type: "numberObject",
        key: "quality",
        operator: ">",
        value: 0.8,
        target: "all",
      },
      {
        column: "scores_avg",
        type: "numberObject",
        key: "quality",
        operator: "<",
        value: 0.6,
        target: "run-b",
      },
      {
        column: "level",
        type: "stringOptions",
        operator: "any of",
        value: ["ERROR"],
        target: "baseline",
      },
    ];
    expect(
      filters.map((filter) =>
        completeExperimentFilter(experimentFilterToDraft(filter)),
      ),
    ).toEqual(filters);
    expect(
      planCommit(
        'scores.quality:>0.8 "Run B".scores.quality:<0.6 baseline.level:ERROR',
        undefined,
        registry,
      ),
    ).toMatchObject({
      status: "committed",
      filters,
      canonical:
        '"All experiments".scores.quality:>0.8 "Run B".scores.quality:<0.6 baseline.level:ERROR',
    });
    expect(
      planCommit("all.scores.quality:>0.8", undefined, registry),
    ).toMatchObject({
      status: "committed",
      filters: [filters[0]],
      canonical: '"All experiments".scores.quality:>0.8',
    });
    const persisted = singleFilterList.parse(
      decodeFiltersGeneric(encodeFiltersGeneric(filters)),
    );
    expect(persisted).toEqual(filters);
    const renamed = registryFor(
      "run-a",
      experiments.map((run) => ({
        ...run,
        experimentName: `${run.experimentName} renamed`,
      })),
    );
    const query = filterStateToQueryText(persisted, {}, renamed);
    expect(query.text).toContain('"Run B renamed".scores.quality:<0.6');
    expect(planCommit(query.text, undefined, renamed)).toMatchObject({
      filters,
    });
  });

  it("keeps targetless saved filters on the baseline or first comparison", () => {
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
    expect(persisted).toEqual(legacy);
    for (const baselineId of ["run-a", undefined]) {
      const registry = registryFor(baselineId);
      const query = filterStateToQueryText(persisted, {}, registry);
      expect(planCommit(query.text, undefined, registry)).toMatchObject({
        status: "committed",
        filters: [{ ...legacy[0], target: baselineId ? "baseline" : "run-b" }],
      });
    }
  });
});
