import type { ComponentProps } from "react";
import { TopicsTargetObject } from "@langfuse/shared";
import type {
  RuleEvaluatorOption,
  RuleSetupStore,
} from "@/src/features/evals/v2/types/rules";

import type { AIAssistedInput } from "@/src/components/ui/AIAssistedInput";
import { RuleEvaluatorsStep } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleEvaluatorsStep";
import { RuleFilterStep } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleFilterStep";
import { RuleNameStep } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleNameStep";

export function RuleSetup({
  projectId,
  evaluatorOptions,
  evaluatorSearch,
  onEvaluatorSearchChange,
  store,
  nameAIAssistance,
  onNameStepOpenChange,
  targetObject,
}: {
  projectId: string;
  evaluatorOptions: RuleEvaluatorOption[];
  evaluatorSearch: string;
  onEvaluatorSearchChange: (search: string) => void;
  store: RuleSetupStore;
  nameAIAssistance: ComponentProps<typeof AIAssistedInput>["aiAssistance"];
  onNameStepOpenChange: (open: boolean) => void;
  targetObject?: "event" | "experiment" | typeof TopicsTargetObject;
}) {
  return (
    <div className="flex flex-col gap-3">
      <RuleFilterStep
        projectId={projectId}
        store={store}
        traceTranscript={targetObject === TopicsTargetObject}
      />
      <RuleEvaluatorsStep
        projectId={projectId}
        evaluatorOptions={evaluatorOptions}
        search={evaluatorSearch}
        onSearchChange={onEvaluatorSearchChange}
        store={store}
      />
      <RuleNameStep
        store={store}
        nameAIAssistance={nameAIAssistance}
        onOpenChange={onNameStepOpenChange}
      />
    </div>
  );
}
