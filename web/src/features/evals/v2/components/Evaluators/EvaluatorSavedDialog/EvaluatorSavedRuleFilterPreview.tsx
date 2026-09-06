import type { FilterState } from "@langfuse/shared";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { RuleFilterPills } from "@/src/features/evals/v2/components/Rules/RuleFilterPills/RuleFilterPills";

export function EvaluatorSavedRuleFilterPreview({
  filter,
  unsupportedReasons,
}: {
  filter: FilterState;
  unsupportedReasons: ReadonlyMap<number, string>;
}) {
  const t = useTranslations("evaluationAnalytics.evaluations");

  return (
    <div className="space-y-2">
      {unsupportedReasons.size > 0 ? (
        <Alert className="border-dark-yellow bg-light-yellow text-dark-yellow [&>svg]:text-dark-yellow rounded-md p-2 [&>svg]:top-2 [&>svg]:left-2 [&>svg+div]:translate-y-0 [&>svg~*]:pl-5">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="mb-1 text-sm">
            {t("evaluator.savedDialog.unsupportedFilters.title")}
          </AlertTitle>
          <AlertDescription className="text-xs">
            {t("evaluator.savedDialog.unsupportedFilters.description", {
              count: unsupportedReasons.size,
              total: filter.length,
            })}
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
