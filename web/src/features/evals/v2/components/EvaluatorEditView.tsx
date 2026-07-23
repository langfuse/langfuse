import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { CreateEvaluationRuleDialog } from "@/src/features/evals/v2/components/CreateEvaluationRuleDialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  EvaluatorSetupForm,
  type CatalogTemplate,
} from "@/src/features/evals/v2/components/EvaluatorSetupForm";
import { api } from "@/src/utils/api";
import { type ObservationVariableMapping } from "@langfuse/shared";

const CREATE_RULE_VALUE = "__create_rule__";

export function EvaluatorEditView({
  projectId,
  evaluatorId,
  sourceTemplate,
  initialMapping,
  scoreName,
  description,
  attachedRuleIds,
  initialEvaluationRuleId,
  onSaved,
  onCancel,
}: {
  projectId: string;
  evaluatorId: string;
  sourceTemplate: CatalogTemplate;
  initialMapping: ObservationVariableMapping[];
  scoreName: string;
  description: string;
  attachedRuleIds: string[];
  initialEvaluationRuleId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [draftScoreName, setDraftScoreName] = useState(scoreName);
  const [draftDescription, setDraftDescription] = useState(description);
  const [selectedRuleId, setSelectedRuleId] = useState(
    initialEvaluationRuleId && attachedRuleIds.includes(initialEvaluationRuleId)
      ? initialEvaluationRuleId
      : (attachedRuleIds[0] ?? null),
  );
  const [createRuleDialogOpen, setCreateRuleDialogOpen] = useState(false);
  const rules = api.evalsV2.rules.useQuery({ projectId });

  if (rules.isPending) {
    return <Skeleton className="m-6 h-96 w-auto" />;
  }

  const attachedRules = (rules.data ?? []).filter(
    (rule) =>
      rule.targetObject === "event" && attachedRuleIds.includes(rule.id),
  );
  const initialRule = attachedRules.find((rule) => rule.id === selectedRuleId);

  return (
    <>
      <EvaluatorSetupForm
        projectId={projectId}
        sourceTemplate={sourceTemplate}
        initialEvaluatorType={sourceTemplate.type === "CODE" ? "code" : "llm"}
        scoreName={draftScoreName}
        description={draftDescription}
        onScoreNameChange={setDraftScoreName}
        onDescriptionChange={setDraftDescription}
        mode="edit"
        evaluatorId={evaluatorId}
        initialMapping={initialMapping}
        initialFilterState={initialRule?.filter ?? []}
        initialSampling={initialRule?.sampling ?? 1}
        attachedRuleIds={attachedRuleIds}
        filterEditingDisabled
        samplingEditingDisabled
        renderDataSourceControls={({ applyRule }) =>
          attachedRules.length > 0 ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="text-sm">from</span>
              <Label htmlFor="edit-evaluator-rule" className="sr-only">
                Evaluation rule
              </Label>
              <Select
                value={selectedRuleId ?? undefined}
                onValueChange={(value) => {
                  if (value === CREATE_RULE_VALUE) {
                    requestAnimationFrame(() => setCreateRuleDialogOpen(true));
                    return;
                  }
                  const rule = attachedRules.find(
                    (candidate) => candidate.id === value,
                  );
                  if (!rule) return;
                  setSelectedRuleId(rule.id);
                  applyRule(rule);
                }}
              >
                <SelectTrigger
                  id="edit-evaluator-rule"
                  className="w-auto max-w-72 min-w-48 text-left [&>span]:text-left"
                >
                  <SelectValue placeholder="Select an attached rule" />
                </SelectTrigger>
                <SelectContent>
                  {attachedRules.map((rule) => (
                    <SelectItem key={rule.id} value={rule.id}>
                      {rule.name}
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  <SelectItem value={CREATE_RULE_VALUE}>
                    Create new rule
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-muted-foreground text-sm whitespace-nowrap">
                Evaluator not attached to a rule
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setCreateRuleDialogOpen(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create rule
              </Button>
            </div>
          )
        }
        onSaved={onSaved}
        onCancel={onCancel}
      />

      {createRuleDialogOpen ? (
        <CreateEvaluationRuleDialog
          projectId={projectId}
          open
          initialEvaluatorIds={[evaluatorId]}
          onOpenChange={setCreateRuleDialogOpen}
        />
      ) : null}
    </>
  );
}
