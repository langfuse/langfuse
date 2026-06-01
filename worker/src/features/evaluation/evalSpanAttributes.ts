import { type JobConfiguration } from "@prisma/client";
import { z } from "zod";
import {
  EvalTargetObject,
  observationVariableMappingList,
  singleFilter,
  variableMappingList,
} from "@langfuse/shared";

const dedupeStrings = (values: string[]): string[] => [
  ...new Set(values.filter(Boolean)),
];

const getFilterDimensions = (filter: JobConfiguration["filter"]): string[] => {
  const parsedFilter = z.array(singleFilter).safeParse(filter);
  if (!parsedFilter.success) return [];

  return dedupeStrings(
    parsedFilter.data.map((filterCondition) => filterCondition.column),
  );
};

const getVariableSourceFields = (
  variableMappingJson: JobConfiguration["variableMapping"],
  targetObject: JobConfiguration["targetObject"],
): string[] => {
  if (
    targetObject === EvalTargetObject.EVENT ||
    targetObject === EvalTargetObject.EXPERIMENT
  ) {
    const parsedObservationMapping =
      observationVariableMappingList.safeParse(variableMappingJson);
    if (!parsedObservationMapping.success) return [];

    return dedupeStrings(
      parsedObservationMapping.data.map((mapping) => mapping.selectedColumnId),
    );
  }

  const parsedTraceMapping = variableMappingList.safeParse(variableMappingJson);
  if (!parsedTraceMapping.success) return [];

  return dedupeStrings(
    parsedTraceMapping.data.map((mapping) => {
      const field = mapping.selectedColumnId;

      if (
        mapping.langfuseObject === "trace" ||
        mapping.langfuseObject === "dataset_item"
      ) {
        return `${mapping.langfuseObject}.${field}`;
      }

      return `${mapping.langfuseObject}.${field}`;
    }),
  );
};

export const buildEvalExecutionSpanAttributes = ({
  config,
}: {
  config: Pick<
    JobConfiguration,
    "id" | "filter" | "targetObject" | "variableMapping"
  >;
}): Record<string, string | number | string[]> => {
  const filterDimensions = getFilterDimensions(config.filter);
  const variableSourceFields = getVariableSourceFields(
    config.variableMapping,
    config.targetObject,
  );

  return {
    "eval.job_configuration.id": config.id,
    "eval.job_configuration.target_object": config.targetObject,
    "eval.job_configuration.filter.dimensions": filterDimensions,
    "eval.job_configuration.filter.dimension_count": filterDimensions.length,
    "eval.variable.source_fields": variableSourceFields,
    "eval.variable.source_field_count": variableSourceFields.length,
  };
};
