import type { EvalTemplateType } from "@langfuse/shared";
import type { ReactNode } from "react";

import { EvaluationTypeConfiguration } from "@/src/features/evals/v2/components/Evaluators/EvaluationTypeConfiguration/EvaluationTypeConfiguration";
import { Stepper } from "@/src/components/design-system/Stepper/Stepper";

type DefinitionStepProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTypeChange: (type: EvalTemplateType) => void;
  isEditing: boolean;
} & DefinitionStepContent;

type DefinitionStepContent =
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
  | {
      type: "DECISION_MODEL";
      typeConfiguration: ReactNode;
      questionsEditor: ReactNode;
    };

function DefinitionStepBody(props: DefinitionStepContent) {
  switch (props.type) {
    case "LLM_AS_JUDGE":
      return (
        <>
          {props.promptEditor}
          {props.scoreOutputEditor}
        </>
      );
    case "CODE":
      return props.codeEditor;
    case "DECISION_MODEL":
      return props.questionsEditor;
  }
}

export function DefinitionStep(props: DefinitionStepProps) {
  return (
    <Stepper
      number={1}
      title="Define evaluation method"
      tooltipText="Use custom code for deterministic checks like exact matches, regex, or schema validation. Use an LLM when the check needs judgment, such as rating helpfulness, tone, or answer quality. Use a decision model for a fast, cheap label with calibrated probabilities when the possible answers are known upfront."
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
      <DefinitionStepBody {...props} />
    </Stepper>
  );
}
