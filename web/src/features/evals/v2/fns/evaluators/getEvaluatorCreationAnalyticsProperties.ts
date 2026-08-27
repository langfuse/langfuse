import type {
  EvalTemplateSourceCodeLanguage,
  EvalTemplateType,
} from "@langfuse/shared";
import type { ScoreOutputDataType } from "@/src/features/evals/v2/scoreOutputTypes";

export type EvaluatorCreationSource =
  | { type: "managed"; templateKey: string }
  | { type: "custom" }
  | { type: "scratch" };

export function getEvaluatorCreationAnalyticsProperties({
  evaluatorType,
  creationSource,
  evaluatorConfig,
  sourceCodeLanguage,
  variableMapping,
}: {
  evaluatorType: EvalTemplateType;
  creationSource: EvaluatorCreationSource;
  evaluatorConfig?: {
    usesDefaultModel: boolean;
    hasCustomModelParams: boolean;
    scoreType: ScoreOutputDataType;
  };
  sourceCodeLanguage?: EvalTemplateSourceCodeLanguage;
  variableMapping?: Array<{
    templateVariable?: string;
    selectedColumnId: string | null;
    jsonSelector?: string | null;
  }>;
}) {
  const configProperties = evaluatorConfig
    ? {
        usesDefaultModel: evaluatorConfig.usesDefaultModel,
        hasCustomModelParams: evaluatorConfig.hasCustomModelParams,
        scoreType: evaluatorConfig.scoreType,
      }
    : {};
  const variableMappingProperties = variableMapping
    ? {
        hasNarrowedVariableMapping: variableMapping.some(
          (mapping) =>
            Boolean(mapping.jsonSelector) && mapping.jsonSelector !== "$",
        ),
        variableMappingSources: [
          ...new Set(
            variableMapping
              .map((mapping) => mapping.selectedColumnId)
              .filter((source): source is string => Boolean(source)),
          ),
        ],
      }
    : {};

  if (creationSource.type === "managed") {
    return {
      evaluatorType,
      managedTemplateKey: creationSource.templateKey,
      isCustomTemplate: false,
      isFromScratch: false,
      ...configProperties,
      ...variableMappingProperties,
      ...(sourceCodeLanguage ? { sourceCodeLanguage } : {}),
    };
  }

  return {
    evaluatorType,
    isCustomTemplate: creationSource.type === "custom",
    isFromScratch: creationSource.type === "scratch",
    ...configProperties,
    ...variableMappingProperties,
    ...(sourceCodeLanguage ? { sourceCodeLanguage } : {}),
  };
}
