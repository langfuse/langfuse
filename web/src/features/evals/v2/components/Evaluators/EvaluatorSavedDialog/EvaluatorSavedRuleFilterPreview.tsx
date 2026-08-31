import type { FilterState } from "@langfuse/shared";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
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
        <Alert variant="warning" size="sm">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Some filters won&apos;t be included</AlertTitle>
          <AlertDescription>
            {unsupportedReasons.size} of {filter.length} sample{" "}
            {filter.length === 1 ? "filter" : "filters"}{" "}
            {unsupportedReasons.size === 1 ? "is" : "are"} only used for testing
            and won&apos;t be included in this rule.
          </AlertDescription>
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
