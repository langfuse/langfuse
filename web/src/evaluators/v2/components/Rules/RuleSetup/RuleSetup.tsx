import type { ComponentProps } from "react";
import type {
  RuleEvaluatorOption,
  RuleSetupStore,
} from "@/src/evaluators/v2/types/rules";

import type { AIAssistedInput } from "@/src/app/design-system/legacy-primitives/ai-assisted-input";
import { RuleEvaluatorsStep } from "@/src/evaluators/v2/components/Rules/RuleSetup/components/RuleEvaluatorsStep";
import { RuleFilterStep } from "@/src/evaluators/v2/components/Rules/RuleSetup/components/RuleFilterStep";
import { RuleNameStep } from "@/src/evaluators/v2/components/Rules/RuleSetup/components/RuleNameStep";

export function RuleSetup({
  projectId,
  evaluatorOptions,
  evaluatorSearch,
  onEvaluatorSearchChange,
  store,
  nameAIAssistance,
  onNameStepOpenChange,
}: {
  projectId: string;
  evaluatorOptions: RuleEvaluatorOption[];
  evaluatorSearch: string;
  onEvaluatorSearchChange: (search: string) => void;
  store: RuleSetupStore;
  nameAIAssistance: ComponentProps<typeof AIAssistedInput>["aiAssistance"];
  onNameStepOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <RuleFilterStep projectId={projectId} store={store} />
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
