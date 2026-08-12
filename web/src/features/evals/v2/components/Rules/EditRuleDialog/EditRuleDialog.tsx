import { observationVariableMappingList } from "@langfuse/shared";
import { useState } from "react";
import { useDebounce } from "@/src/hooks/useDebounce";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EditRuleDialogContent } from "@/src/features/evals/v2/components/Rules/EditRuleDialog/components/EditRuleDialogContent/EditRuleDialogContent";
import type { RuleEvaluatorOption } from "@/src/features/evals/v2/types/rules";
import { api } from "@/src/utils/api";

export function EditRuleDialog({
  projectId,
  ruleId,
  canEdit,
  onOpenChange,
}: {
  projectId: string;
  ruleId: string;
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rule = api.evalsV2.rules.get.useQuery({ projectId, ruleId });
  const [evaluatorSearch, setEvaluatorSearch] = useState("");
  const [evaluatorSearchQuery, setEvaluatorSearchQuery] = useState("");
  const debouncedEvaluatorSearch = useDebounce(
    setEvaluatorSearchQuery,
    300,
    false,
  );
  const evaluatorOptions = api.evalsV2.rules.evaluatorOptions.useQuery({
    projectId,
    limit: 100,
    search: evaluatorSearchQuery.trim() || undefined,
  });
  const options: RuleEvaluatorOption[] = (evaluatorOptions.data ?? []).map(
    (evaluator) => ({
      id: evaluator.id,
      name: evaluator.name,
      type: evaluator.type,
      defaultVariableMapping: observationVariableMappingList
        .catch([])
        .parse(evaluator.latestVersion?.variableMapping),
    }),
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-w-6xl" closeOnInteractionOutside>
        <DialogHeader>
          <DialogTitle>{rule.data?.name ?? "Evaluation rule"}</DialogTitle>
        </DialogHeader>
        {rule.isPending || !rule.data ? (
          <DialogBody>
            <Skeleton className="h-96 w-full" />
          </DialogBody>
        ) : (
          <EditRuleDialogContent
            key={rule.data.id}
            projectId={projectId}
            rule={rule.data}
            evaluatorOptions={options}
            evaluatorSearch={evaluatorSearch}
            onEvaluatorSearchChange={(value) => {
              setEvaluatorSearch(value);
              debouncedEvaluatorSearch(value);
            }}
            canEdit={canEdit}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
