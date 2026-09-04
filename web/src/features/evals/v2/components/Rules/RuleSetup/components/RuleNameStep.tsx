import type { ComponentProps } from "react";
import { useStore } from "zustand";

import { AIAssistedInput } from "@/src/components/ui/ai-assisted-input";
import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";

export function RuleNameStep({
  store,
  nameAIAssistance,
  onOpenChange,
}: {
  store: RuleSetupStore;
  nameAIAssistance: ComponentProps<typeof AIAssistedInput>["aiAssistance"];
  onOpenChange: (open: boolean) => void;
}) {
  const name = useStore(store, (state) => state.name);
  const setName = useStore(store, (state) => state.actions.setName);

  return (
    <Stepper
      number={3}
      title="Name rule"
      description="Choose a name that describes what this rule evaluates."
      onOpenChange={onOpenChange}
    >
      <div className="max-w-xl space-y-2">
        <label htmlFor="evaluation-rule-name" className="text-sm font-bold">
          Name
        </label>
        <AIAssistedInput
          id="evaluation-rule-name"
          value={name}
          maxLength={200}
          placeholder={
            nameAIAssistance.state === "generating"
              ? "Generating a name…"
              : "Rule name"
          }
          onChange={(event) => setName(event.target.value)}
          aiAssistance={nameAIAssistance}
        />
      </div>
    </Stepper>
  );
}
