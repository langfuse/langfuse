import { TopicsTargetObject } from "@langfuse/shared";

import type { RuleTargetObject } from "@/src/features/evals/v2/types/rules";

export const TRACE_FILTER_TOOLTIP =
  "A trace matches if at least one of its observations matches all filters. All filters must match that same observation. Example: name = llm-call and level = ERROR matches traces with a failed llm-call observation. A trace whose llm-call succeeded while a different observation failed does not match.";

const OBSERVATION_FILTER_TOOLTIP =
  "Only new observations matching these filters are evaluated by this rule.";

/** Copy for the rule scope step; projects without trace evals keep the observation-only wording. */
export function ruleScopeCopy(
  targetObject: RuleTargetObject,
  scopeSelectable: boolean,
) {
  if (!scopeSelectable) {
    return {
      stepDescription:
        "Set filters and a sampling rate to control which incoming observations are evaluated.",
      filterTitle: "Filter observations",
      filterDescription: "Define which incoming observations match this rule.",
      filterTooltip: OBSERVATION_FILTER_TOOLTIP,
      sampling: {},
    };
  }
  const stepDescription =
    "Do you want to evaluate a single observation, or all the messages within a trace?";
  if (targetObject === TopicsTargetObject) {
    return {
      stepDescription,
      filterTitle: "Filter",
      filterDescription:
        "A trace is evaluated if at least one of its observations matches all filters below.",
      filterTooltip: TRACE_FILTER_TOOLTIP,
      sampling: {
        description: "Percentage of matching traces that are evaluated.",
        tooltip:
          "The percentage of matching traces that will be evaluated. Lower sampling rates reduce evaluation volume and cost.",
      },
    };
  }
  return {
    stepDescription,
    filterTitle: "Filter",
    filterDescription:
      "Only observations that match all filters below are evaluated.",
    filterTooltip: OBSERVATION_FILTER_TOOLTIP,
    sampling: {
      description: "Percentage of matching observations that are evaluated.",
    },
  };
}
