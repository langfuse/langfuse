import {
  EvalTargetObject,
  InternalServerError,
  observationVariableMappingList,
  variableMappingList,
} from "@langfuse/shared";

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
