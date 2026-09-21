import { useStore } from "zustand";

import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import type { EvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

const INSTRUCTIONS_ID = "decision-model-instructions";

/**
 * The single question a decision model answers about each observation. The
 * observation's input, output, tool calls, and expected output are sent as the
 * model state, so the instructions carry no variables.
 */
export function DecisionModelInstructionsEditor({
  store,
}: {
  store: EvaluatorSetupStore;
}) {
  const instructions = useStore(store, (state) => state.instructions);
  const setInstructions = store.getState().actions.setInstructions;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={INSTRUCTIONS_ID} className="flex items-center gap-1.5">
        Question
        <InfoTooltip label="About decision-model questions">
          Ask one atomic question. The model reads the observation input,
          output, tool calls, and expected output as its state and answers with
          exactly one of the categories below, plus a probability for each. It
          returns no rationale, so describe the categories precisely.
        </InfoTooltip>
      </Label>
      <Textarea
        id={INSTRUCTIONS_ID}
        value={instructions}
        onChange={(event) => setInstructions(event.target.value)}
        placeholder="Does the output answer the input accurately and completely?"
        rows={4}
      />
    </div>
  );
}
