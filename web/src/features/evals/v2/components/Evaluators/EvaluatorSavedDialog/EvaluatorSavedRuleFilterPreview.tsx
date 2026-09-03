import type { FilterState } from "@langfuse/shared";
import { AlertTriangle } from "lucide-react";

import { Alert } from "@/src/components/design-system/Alert/Alert";
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
        <Alert variant="warning" size="sm" icon={AlertTriangle}>
          <Alert.Title>Some filters won&apos;t be included</Alert.Title>
          <Alert.Description>
            {unsupportedReasons.size} of {filter.length} sample{" "}
            {filter.length === 1 ? "filter" : "filters"}{" "}
            {unsupportedReasons.size === 1 ? "is" : "are"} only used for testing
            and won&apos;t be included in this rule.
          </Alert.Description>
        </Alert>
      ) : null}
      <RuleFilterPills
        filter={filter}
        display="search-bar"
        disabledReasons={unsupportedReasons}
      />
    </div>
  );
}
