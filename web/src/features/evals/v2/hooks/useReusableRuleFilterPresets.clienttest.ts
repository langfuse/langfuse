// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";

import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import { RULE_SAMPLE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/evaluatorSearchRegistry";
import { prepareReusableRuleFilterPresets } from "@/src/features/evals/v2/hooks/useReusableRuleFilterPresets";
import {
  EVENTS_FIELD_REGISTRY,
  withFieldOptions,
} from "@/src/features/search-bar/lib/fields";

const reusableFilters = [
  {
    latestRuleId: "rule-1",
    filter: [
      {
        column: "tags",
        type: "arrayOptions",
        operator: "any of",
        value: ["production"],
      },
    ] satisfies FilterState,
    evaluatorCount: 3,
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  },
];

describe("prepareReusableRuleFilterPresets", () => {
  it.each([
    [
      "evaluator sample observations",
      EVENTS_FIELD_REGISTRY,
      "traceTags:production",
    ],
    ["rule filters", RULE_FIELD_REGISTRY, "tags:production"],
  ])("builds reusable queries for %s", (_surface, registry, expectedQuery) => {
    expect(prepareReusableRuleFilterPresets(reusableFilters, registry)).toEqual(
      {
        sections: [
          {
            title: "Reuse rule filters",
            options: [
              {
                id: "rule-filter:rule-1",
                label: expectedQuery,
                detail: "Used by 3 evaluators",
                query: expectedQuery,
              },
            ],
          },
        ],
        presets: [
          {
            id: "rule-filter:rule-1",
            evaluatorCount: 3,
            filterCount: 1,
          },
        ],
      },
    );
  });

  it("preserves exact name matching when adapting to the events registry", () => {
    const exactNameFilter = [
      {
        latestRuleId: "rule-exact-name",
        filter: [
          {
            column: "name",
            type: "stringOptions",
            operator: "any of",
            value: ["checkout"],
          },
        ] satisfies FilterState,
        evaluatorCount: 1,
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ];

    const events = prepareReusableRuleFilterPresets(
      exactNameFilter,
      EVENTS_FIELD_REGISTRY,
    );
    const rules = prepareReusableRuleFilterPresets(
      exactNameFilter,
      RULE_FIELD_REGISTRY,
    );

    expect(events.sections[0]?.options[0]?.query).toBe("name:=checkout");
    expect(rules.sections[0]?.options[0]?.query).toBe("name:checkout");
  });

  it("renders dataset-scoped presets with names instead of IDs", () => {
    const datasetFilters = [
      {
        latestRuleId: "rule-dataset",
        filter: [
          {
            column: "experimentDatasetId",
            type: "stringOptions",
            operator: "any of",
            value: ["dataset-id"],
          },
        ] satisfies FilterState,
        evaluatorCount: 1,
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ];
    const registry = withFieldOptions(
      RULE_SAMPLE_FIELD_REGISTRY,
      "datasetName",
      [{ value: "dataset-id", displayValue: "Filter QA Dataset" }],
    );

    expect(
      prepareReusableRuleFilterPresets(datasetFilters, registry).sections[0]
        ?.options[0]?.query,
    ).toBe('datasetName:"Filter QA Dataset"');
  });
});
