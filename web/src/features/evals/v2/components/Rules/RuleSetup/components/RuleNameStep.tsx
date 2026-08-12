import { useStore } from "zustand";

import { Input } from "@/src/components/ui/input";
import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";
import type { RuleSetupStore } from "@/src/features/evals/v2/types/rules";

export function RuleNameStep({
  store,
  isSuggestingName,
  onOpenChange,
}: {
  store: RuleSetupStore;
  isSuggestingName: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const name = useStore(store, (state) => state.name);
  const setName = useStore(store, (state) => state.actions.setName);

  return (
    <Stepper
      number={3}
      title="Name rule"
      description="Use a clear name so this rule can be reused."
      defaultOpen={name.length > 0}
      onOpenChange={onOpenChange}
    >
      <div className="max-w-xl space-y-2">
        <label htmlFor="evaluation-rule-name" className="text-sm font-bold">
          Name
        </label>
        <Input
          id="evaluation-rule-name"
          value={name}
          maxLength={200}
          placeholder={isSuggestingName ? "Generating a name…" : "Rule name"}
          disabled={isSuggestingName}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
    </Stepper>
  );
}
