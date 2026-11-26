import type { EvalTemplateType } from "@langfuse/shared";
import type { ReactNode } from "react";

import { EvaluationTypeToggle } from "@/src/features/evals/v2/components/Evaluators/EvaluationTypeConfiguration/components/EvaluationTypeToggle/EvaluationTypeToggle";
import { FieldRow } from "@/src/features/evals/v2/components/Evaluators/FieldRow/FieldRow";
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
          <FieldRow label="Prompt" align="start">
            {props.promptEditor}
          </FieldRow>
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
      size="md"
      title="Method"
      tooltip={
        <ul className="flex list-disc flex-col gap-1.5 pl-4">
          <li>
            <span className="font-bold">LLM-as-a-judge</span>: when the check
            needs judgment, such as rating helpfulness, tone, or answer quality.
          </li>
          <li>
            <span className="font-bold">Code evaluator</span>: for deterministic
            checks like exact matches, regex, or schema validation.
          </li>
          <li>
            <span className="font-bold">Decision model</span>: for a fast, cheap
            label with calibrated probabilities when the possible answers are
            known upfront.
          </li>
        </ul>
      }
      open={props.open}
      onOpenChange={props.onOpenChange}
      headerEnd={
        <EvaluationTypeToggle
          value={props.type}
          onValueChange={props.onTypeChange}
          disabled={props.isEditing}
        />
      }
    >
      <div className="flex flex-col gap-2 pt-3">
        <FieldRow label={props.type === "CODE" ? "Language" : "Model"}>
          {props.typeConfiguration}
        </FieldRow>
        <DefinitionStepBody {...props} />
      </div>
    </Stepper>
  );
}
