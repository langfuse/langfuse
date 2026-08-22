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
        <Alert className="border-dark-yellow bg-light-yellow text-dark-yellow [&>svg]:text-dark-yellow rounded-md p-2 [&>svg]:top-2 [&>svg]:left-2 [&>svg+div]:translate-y-0 [&>svg~*]:pl-5">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="mb-1 text-sm">
            Some filters won&apos;t be included
          </AlertTitle>
          <AlertDescription className="text-xs">
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
