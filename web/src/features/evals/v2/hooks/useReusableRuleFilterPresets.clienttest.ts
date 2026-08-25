// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { FilterState } from "@langfuse/shared";

import { RULE_FIELD_REGISTRY } from "@/src/features/evals/v2/constants/ruleSearchRegistry";
import { prepareReusableRuleFilterPresets } from "@/src/features/evals/v2/hooks/useReusableRuleFilterPresets";
import { EVENTS_FIELD_REGISTRY } from "@/src/features/search-bar/lib/fields";

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
    ["evaluator sample observations", EVENTS_FIELD_REGISTRY],
    ["rule filters", RULE_FIELD_REGISTRY],
  ])("builds reusable queries for %s", (_surface, registry) => {
    expect(prepareReusableRuleFilterPresets(reusableFilters, registry)).toEqual(
      {
        sections: [
          {
            title: "Reuse rule filters",
            options: [
              {
                id: "rule-filter:rule-1",
                label: "tags:production",
                detail: "Used by 3 evaluators",
                query: "tags:production",
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
});
