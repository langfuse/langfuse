import type { ComponentProps, ReactNode } from "react";
import type {
  RuleEvaluatorOption,
  RuleSetupStore,
} from "@/src/features/evals/v2/types/rules";

import type { AIAssistedInput } from "@/src/components/ui/AIAssistedInput";
import { RuleEvaluatorsStep } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleEvaluatorsStep";
import { RuleNameStep } from "@/src/features/evals/v2/components/Rules/RuleSetup/components/RuleNameStep";

/** Callers render `filterStep` because the scope control differs between create and edit. */
export function RuleSetup({
  filterStep,
  projectId,
  evaluatorOptions,
  evaluatorSearch,
  onEvaluatorSearchChange,
  store,
  nameAIAssistance,
  onNameStepOpenChange,
}: {
  filterStep: ReactNode;
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
      {filterStep}
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
