import type { FilterState } from "@langfuse/shared";

import { Banner } from "@/src/components/design-system/Banner/Banner";
import { RuleFilterPills } from "@/src/features/evals/v2/components/Rules/RuleFilterPills/RuleFilterPills";

export function EvaluatorSavedRuleFilterPreview({
  filter,
  unsupportedReasons,
}: {
  filter: FilterState;
  unsupportedReasons: ReadonlyMap<number, string>;
}) {
  return (
    <div className="space-y-2">
      {unsupportedReasons.size > 0 ? (
        <Banner variant="warning" title="Some filters won't be included">
          {unsupportedReasons.size} of {filter.length} sample{" "}
          {filter.length === 1 ? "filter" : "filters"}{" "}
          {unsupportedReasons.size === 1 ? "is" : "are"} only used for testing
          and won&apos;t be included in this rule.
        </Banner>
      ) : null}
      <RuleFilterPills
        filter={filter}
        display="search-bar"
        disabledReasons={unsupportedReasons}
      />
    </div>
  );
}
