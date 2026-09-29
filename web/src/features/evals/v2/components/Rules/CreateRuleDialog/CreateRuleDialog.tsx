import { type EvalTargetObject, type FilterState } from "@langfuse/shared";
import { useState } from "react";
import { useDebounce } from "@/src/hooks/useDebounce";
import { CreateRuleDialogContent } from "@/src/features/evals/v2/components/Rules/CreateRuleDialog/components/CreateRuleDialogContent/CreateRuleDialogContent";
import type {
  RuleDraft,
  RuleEvaluatorOption,
  RuleTableRow,
} from "@/src/features/evals/v2/types/rules";
import { prepareModernRuleVariableMapping } from "@/src/features/evals/v2/fns/variableMapping/prepareModernRuleVariableMapping";
import { prepareRuleCloneDraft } from "@/src/features/evals/v2/fns/rules/prepareRuleCloneDraft";
import { api } from "@/src/utils/api";

export function CreateRuleDialog({
  projectId,
  open,
  onOpenChange,
  initialEvaluator,
  initialRule,
  initialFilter,
  targetObject,
  successNotification,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEvaluator?: RuleEvaluatorOption;
  initialRule?: RuleTableRow;
  initialFilter?: FilterState;
  targetObject?: Extract<EvalTargetObject, "event" | "experiment">;
  successNotification: "toast" | "none";
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
        evaluator.type,
      ),
    }),
  );
  const initialEvaluatorFromOptions = options.find(
    (evaluator) => evaluator.id === initialEvaluator?.id,
  );
  const resolvedInitialEvaluator =
    initialEvaluatorFromOptions ?? initialEvaluator;
  const initialDraft: RuleDraft | undefined = initialRule
    ? prepareRuleCloneDraft(initialRule)
    : undefined;
  const missingInitialRuleEvaluators = (initialDraft?.assignments ?? [])
    .filter(
      (assignment) =>
        !options.some((option) => option.id === assignment.evaluatorId),
    )
    .map((assignment) => ({
      id: assignment.evaluatorId,
      name: assignment.evaluatorName,
      type: assignment.evaluatorType,
      defaultVariableMapping: assignment.defaultVariableMapping,
      initialVariableMapping: assignment.variableMapping,
    }));

  return (
    <CreateRuleDialogContent
      key={initialRule?.id ?? initialEvaluator?.id ?? "empty"}
      projectId={projectId}
      open={open}
      onOpenChange={onOpenChange}
      evaluatorOptions={[
        ...missingInitialRuleEvaluators,
        ...(resolvedInitialEvaluator && !initialEvaluatorFromOptions
          ? [resolvedInitialEvaluator]
          : []),
        ...options,
      ]}
      initialEvaluator={resolvedInitialEvaluator}
      initialDraft={initialDraft}
      initialFilter={initialFilter}
      targetObject={targetObject}
      evaluatorSearch={evaluatorSearch}
      successNotification={successNotification}
      onEvaluatorSearchChange={(value) => {
        setEvaluatorSearch(value);
        debouncedEvaluatorSearch(value);
      }}
    />
  );
}
