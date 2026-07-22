import { useState } from "react";

import { Skeleton } from "@/src/components/ui/skeleton";
import {
  EvaluatorSetupForm,
  type CatalogTemplate,
} from "@/src/features/evals/v2/components/EvaluatorSetupForm";
import { api } from "@/src/utils/api";
import { type ObservationVariableMapping } from "@langfuse/shared";

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
  const rules = api.evalsV2.rules.useQuery({ projectId });

  if (rules.isPending) {
    return <Skeleton className="m-6 h-96 w-auto" />;
  }

  const initialRule = (rules.data ?? []).find(
    (rule) =>
      rule.targetObject === "event" && rule.id === initialEvaluationRuleId,
  );

  return (
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
      onSaved={onSaved}
      onCancel={onCancel}
    />
  );
}
