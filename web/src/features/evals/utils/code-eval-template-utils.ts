import {
  EvalTargetObject,
  EvalTemplateType,
  type EvalTemplate,
  type ObservationVariableMapping,
} from "@langfuse/shared";

export const isCodeEvalTemplate = (
  template: Partial<Pick<EvalTemplate, "type">> | null | undefined,
) => template?.type === EvalTemplateType.CODE;

export const shouldShowEvalTemplate = (
  template: Pick<EvalTemplate, "type">,
  codeEvalEnabled: boolean,
) => !isCodeEvalTemplate(template) || codeEvalEnabled;

export function getCodeEvalVariableMapping(): ObservationVariableMapping[] {
  return [
    {
      templateVariable: "input",
      selectedColumnId: "input",
      jsonSelector: null,
    },
    {
      templateVariable: "output",
      selectedColumnId: "output",
      jsonSelector: null,
    },
    {
      templateVariable: "observationMetadata",
      selectedColumnId: "metadata",
      jsonSelector: null,
    },
    {
      templateVariable: "experimentItemExpectedOutput",
      selectedColumnId: "experimentItemExpectedOutput",
      jsonSelector: null,
    },
    {
      templateVariable: "experimentItemMetadata",
      selectedColumnId: "experimentItemMetadata",
      jsonSelector: null,
    },
  ];
}

export function resolveCodeEvalTarget(target: EvalTargetObject) {
  if (target === EvalTargetObject.TRACE) return EvalTargetObject.EVENT;
  if (target === EvalTargetObject.DATASET) return EvalTargetObject.EXPERIMENT;
  return target;
}
