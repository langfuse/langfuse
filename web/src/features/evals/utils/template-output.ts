import {
  PersistedEvalOutputDefinitionSchema,
  resolvePersistedEvalOutputDefinition,
  ScoreDataTypeEnum,
} from "@langfuse/shared";

type TemplateResultTypeLabels = {
  unknown: string;
  categorical: string;
  boolean: string;
  numeric: string;
};

const defaultTemplateResultTypeLabels: TemplateResultTypeLabels = {
  unknown: "Unknown",
  categorical: "Categorical",
  boolean: "Boolean",
  numeric: "Numeric",
};

export const getTemplateResultType = (
  outputDefinition: unknown,
  labels: TemplateResultTypeLabels = defaultTemplateResultTypeLabels,
) => {
  if (typeof outputDefinition !== "object" || outputDefinition === null) {
    return labels.unknown;
  }

  const hasStructuredOutputMarkers =
    "version" in outputDefinition || "dataType" in outputDefinition;
  const hasLegacyOutputMarkers =
    "reasoning" in outputDefinition || "score" in outputDefinition;

  if (!hasStructuredOutputMarkers && !hasLegacyOutputMarkers) {
    return labels.unknown;
  }

  const parsedOutputDefinition =
    PersistedEvalOutputDefinitionSchema.safeParse(outputDefinition);

  if (!parsedOutputDefinition.success) {
    return labels.unknown;
  }

  switch (
    resolvePersistedEvalOutputDefinition(parsedOutputDefinition.data).dataType
  ) {
    case ScoreDataTypeEnum.CATEGORICAL:
      return labels.categorical;
    case ScoreDataTypeEnum.BOOLEAN:
      return labels.boolean;
    default:
      return labels.numeric;
  }
};
