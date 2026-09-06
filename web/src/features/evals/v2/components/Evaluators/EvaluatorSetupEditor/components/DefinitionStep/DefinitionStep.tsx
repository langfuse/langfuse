import type { EvalTemplateType } from "@langfuse/shared";
import type { ReactNode } from "react";

import { EvaluationTypeConfiguration } from "@/src/features/evals/v2/components/Evaluators/EvaluationTypeConfiguration/EvaluationTypeConfiguration";
import { Stepper } from "@/src/features/evals/v2/components/Stepper/Stepper";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("evaluationAnalytics.evaluations");
  return (
    <Stepper
      number={1}
      title={t("setup.definition.title")}
      description={t("setup.definition.description")}
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
