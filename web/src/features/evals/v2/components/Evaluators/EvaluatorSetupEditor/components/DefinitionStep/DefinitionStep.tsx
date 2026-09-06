import type { EvalTemplateType } from "@langfuse/shared";
import type { ReactNode } from "react";

import { EvaluationTypeConfiguration } from "@/src/features/evals/v2/components/Evaluators/EvaluationTypeConfiguration/EvaluationTypeConfiguration";
import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";

type DefinitionStepProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTypeChange: (type: EvalTemplateType) => void;
  isEditing: boolean;
} & (
  | {
      type: "LLM_AS_JUDGE";
      typeConfiguration: ReactNode;
      promptEditor: ReactNode;
      scoreOutputEditor: ReactNode;
    }
  | {
      type: "CODE";
      typeConfiguration: ReactNode;
      codeEditor: ReactNode;
    }
);

export function DefinitionStep(props: DefinitionStepProps) {
  return (
    <Stepper
      number={1}
      title="Define evaluation"
      description="Choose whether an LLM or your own code evaluates the data, then define the instructions it follows and the score it reports."
      open={props.open}
      onOpenChange={props.onOpenChange}
    >
      <EvaluationTypeConfiguration
        mode={props.type}
        onModeChange={props.onTypeChange}
        disabled={props.isEditing}
      >
        {props.typeConfiguration}
      </EvaluationTypeConfiguration>
      {props.type === "LLM_AS_JUDGE" ? (
        <>
          {props.promptEditor}
          {props.scoreOutputEditor}
        </>
      ) : (
        props.codeEditor
      )}
    </Stepper>
  );
}
