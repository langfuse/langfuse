import type { FilterState } from "@langfuse/shared";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import { Alert } from "@/src/components/design-system/Alert/Alert";
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
        <Alert variant="warning" size="sm" icon={AlertTriangle}>
          <Alert.Title>
            {t("evaluator.savedDialog.unsupportedFilters.title")}
          </Alert.Title>
          <Alert.Description>
            {t("evaluator.savedDialog.unsupportedFilters.description", {
              count: unsupportedReasons.size,
              total: filter.length,
            })}
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
