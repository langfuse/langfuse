import {
  EvalTargetObject,
  type EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
  type EvalTemplate,
  type ObservationVariableMapping,
} from "@langfuse/shared";

export const isCodeEvalTemplate = (
  template: Partial<Pick<EvalTemplate, "type">> | null | undefined,
) => template?.type === EvalTemplateType.CODE;

type CodeEvalCapabilities = {
  enabled: boolean;
  supportedSourceCodeLanguages: EvalTemplateSourceCodeLanguage[];
};

export const CODE_EVAL_TEMPLATE_VARIABLES = [
  "input",
  "output",
  "metadata",
  "experimentItemExpectedOutput",
  "experimentItemMetadata",
] as const;

export const shouldShowEvalTemplate = (
  template: Partial<Pick<EvalTemplate, "type" | "sourceCodeLanguage">>,
  codeEvalCapabilities: CodeEvalCapabilities,
) => {
  if (!isCodeEvalTemplate(template)) return true;

  return (
    codeEvalCapabilities.enabled &&
    Boolean(
      template.sourceCodeLanguage &&
      codeEvalCapabilities.supportedSourceCodeLanguages.includes(
        template.sourceCodeLanguage,
      ),
    )
  );
};

export const CODE_EVAL_ESCAPE_CONFIRM_MESSAGE =
  "Close code editor? Unsaved changes will be lost.";

export function getCodeEvalVariableMapping(): ObservationVariableMapping[] {
  return CODE_EVAL_TEMPLATE_VARIABLES.map((variable) => ({
    templateVariable: variable,
    selectedColumnId: variable,
    jsonSelector: null,
  }));
}

export function resolveCodeEvalTarget(target: EvalTargetObject) {
  if (target === EvalTargetObject.TRACE) return EvalTargetObject.EVENT;
  if (target === EvalTargetObject.DATASET) return EvalTargetObject.EXPERIMENT;
  return target;
}
