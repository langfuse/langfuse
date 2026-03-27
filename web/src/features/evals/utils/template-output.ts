import {
  PersistedEvalOutputDefinitionSchema,
  resolvePersistedEvalOutputDefinition,
  ScoreDataTypeEnum,
} from "@langfuse/shared";

export const getTemplateResultType = (outputDefinition: unknown) => {
  if (typeof outputDefinition !== "object" || outputDefinition === null) {
    return "Unknown";
  }

  const hasStructuredOutputMarkers =
    "version" in outputDefinition || "dataType" in outputDefinition;
  const hasLegacyOutputMarkers =
    "reasoning" in outputDefinition || "score" in outputDefinition;

  if (!hasStructuredOutputMarkers && !hasLegacyOutputMarkers) {
    return "Unknown";
  }

  const parsedOutputDefinition =
    PersistedEvalOutputDefinitionSchema.safeParse(outputDefinition);

  if (!parsedOutputDefinition.success) {
    return "Unknown";
  }

  switch (
    resolvePersistedEvalOutputDefinition(parsedOutputDefinition.data).dataType
  ) {
    case ScoreDataTypeEnum.CATEGORICAL:
      return "Categorical";
    case ScoreDataTypeEnum.BOOLEAN:
      return "Boolean";
    default:
      return "Numeric";
  }
};
