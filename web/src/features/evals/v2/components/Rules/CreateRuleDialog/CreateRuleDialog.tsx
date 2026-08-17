import { type EvalTargetObject, type FilterState } from "@langfuse/shared";
import { useState } from "react";
import { useDebounce } from "@/src/hooks/useDebounce";
import { CreateRuleDialogContent } from "@/src/features/evals/v2/components/Rules/CreateRuleDialog/components/CreateRuleDialogContent/CreateRuleDialogContent";
import type { RuleEvaluatorOption } from "@/src/features/evals/v2/types/rules";
import { prepareModernRuleVariableMapping } from "@/src/features/evals/v2/fns/variableMapping/prepareModernRuleVariableMapping";
import { api } from "@/src/utils/api";

export function CreateRuleDialog({
  projectId,
  open,
  onOpenChange,
  initialEvaluator,
  initialFilter,
  targetObject,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEvaluator?: RuleEvaluatorOption;
  initialFilter?: FilterState;
  targetObject?: Extract<EvalTargetObject, "event" | "experiment">;
}) {
  const [evaluatorSearch, setEvaluatorSearch] = useState("");
  const [evaluatorSearchQuery, setEvaluatorSearchQuery] = useState("");
  const debouncedEvaluatorSearch = useDebounce(
    setEvaluatorSearchQuery,
    300,
    false,
  );
  const evaluatorOptions = api.evalsV2.options.useQuery(
    {
      projectId,
      limit: 100,
      search: evaluatorSearchQuery.trim() || undefined,
    },
    { enabled: open },
  );
  const options: RuleEvaluatorOption[] = (evaluatorOptions.data ?? []).map(
    (evaluator) => ({
      id: evaluator.id,
      name: evaluator.name,
      type: evaluator.type,
      updatedAt: evaluator.updatedAt,
      createdByUser: evaluator.createdByUser,
      ...prepareModernRuleVariableMapping(
        evaluator.latestVersion?.variableMapping,
      ),
    }),
  );
  const initialEvaluatorFromOptions = options.find(
    (evaluator) => evaluator.id === initialEvaluator?.id,
  );
  const resolvedInitialEvaluator =
    initialEvaluatorFromOptions ?? initialEvaluator;

  return (
    <CreateRuleDialogContent
      key={initialEvaluator?.id ?? "empty"}
      projectId={projectId}
      open={open}
      onOpenChange={onOpenChange}
      evaluatorOptions={
        resolvedInitialEvaluator && !initialEvaluatorFromOptions
          ? [resolvedInitialEvaluator, ...options]
          : options
      }
      initialEvaluator={resolvedInitialEvaluator}
      initialFilter={initialFilter}
      targetObject={targetObject}
      evaluatorSearch={evaluatorSearch}
      onEvaluatorSearchChange={(value) => {
        setEvaluatorSearch(value);
        debouncedEvaluatorSearch(value);
      }}
    />
  );
}
