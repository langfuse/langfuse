import {
  EvalTargetObject,
  EvalTemplateType,
  InternalServerError,
  LangfuseConflictError,
  observationVariableMappingList,
  variableMappingList,
} from "@langfuse/shared";
import { CODE_EVAL_TEMPLATE_VARIABLES } from "@/src/features/evals/utils/code-eval-template-utils";

// accepts both stored templates and createTemplate inputs (CODE inputs carry no vars)
export const getEvalTemplateVariables = (template: {
  type: EvalTemplateType;
  vars?: string[];
}) =>
  template.type === EvalTemplateType.CODE
    ? [...CODE_EVAL_TEMPLATE_VARIABLES]
    : (template.vars ?? []);

export function prepareVariableMappingForEvaluatorUpgrade(params: {
  targetObject: string;
  variableMapping: unknown;
  nextVariables: string[];
}) {
  const mappingSchema =
    params.targetObject === EvalTargetObject.EVENT ||
    params.targetObject === EvalTargetObject.EXPERIMENT
      ? observationVariableMappingList
      : variableMappingList;
  const mappingParseResult = mappingSchema.safeParse(params.variableMapping);

  if (!mappingParseResult.success) {
    throw new InternalServerError("Evaluation rule mapping is corrupted");
  }

  const migratedVariableMapping = mappingParseResult.data.filter((mapping) =>
    params.nextVariables.includes(mapping.templateVariable),
  );
  const mappedVariables = new Set(
    migratedVariableMapping.map((mapping) => mapping.templateVariable),
  );
  const missingVariables = params.nextVariables.filter(
    (variable) => !mappedVariables.has(variable),
  );

  return {
    variableMapping: migratedVariableMapping,
    missingVariables,
  };
}

export const prepareConfigsForTemplateUpgrade = (params: {
  configs: {
    id: string;
    scoreName: string;
    targetObject: string;
    variableMapping: unknown;
  }[];
  nextVariables: string[];
}) =>
  params.configs.map((config) => {
    const preparedMapping = prepareVariableMappingForEvaluatorUpgrade({
      targetObject: config.targetObject,
      variableMapping: config.variableMapping,
      nextVariables: params.nextVariables,
    });

    if (preparedMapping.missingVariables.length > 0) {
      throw new LangfuseConflictError(
        `Creating a new evaluator version would invalidate the evaluator "${config.scoreName}" because it is missing mappings for new evaluator variables: ${preparedMapping.missingVariables.join(", ")}. Remove the new variable(s) from the template, or delete the evaluator "${config.scoreName}" and recreate it with a complete mapping.`,
      );
    }

    return {
      id: config.id,
      variableMapping: preparedMapping.variableMapping,
    };
  });
