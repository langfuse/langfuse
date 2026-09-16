import { type JobConfiguration } from "@prisma/client";
import { z } from "zod";
import {
  EvalTargetObject,
  observationVariableMappingList,
  singleFilter,
  variableMappingList,
} from "@langfuse/shared";
import {
  EvaluatorBlockSource,
  type EvaluatorLlmErrorClassification,
} from "@langfuse/shared/src/server";

const dedupeStrings = (values: string[]): string[] => [
  ...new Set(values.filter(Boolean)),
];

const getFilterDimensions = (filter: JobConfiguration["filter"]): string[] => {
  const parsedFilter = z.array(singleFilter).safeParse(filter);
  if (!parsedFilter.success) return [];

  return dedupeStrings(parsedFilter.data.map(({ column }) => column));
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
      parsedObservationMapping.data.map(
        ({ selectedColumnId }) => selectedColumnId,
      ),
    );
  }

  const parsedTraceMapping = variableMappingList.safeParse(variableMappingJson);
  if (!parsedTraceMapping.success) return [];

  return dedupeStrings(
    parsedTraceMapping.data.map(
      ({ langfuseObject, selectedColumnId }) =>
        `${langfuseObject}.${selectedColumnId}`,
    ),
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

/**
 * Low-cardinality evaluator policy attributes derived from native AI SDK
 * errors. Provider messages and response bodies intentionally stay out of
 * span attributes; instrumentAsync records the propagated exception.
 */
export const buildEvaluatorLlmErrorSpanAttributes = (
  classification: EvaluatorLlmErrorClassification | null,
): Record<string, string | number | boolean> => {
  if (!classification) {
    return {
      "eval.llm.error.kind": "unknown",
      "eval.llm.blocked": false,
    };
  }

  const retryError =
    "retryError" in classification ? classification.retryError : undefined;

  return {
    "eval.llm.error.kind": classification.kind,
    "eval.llm.error.retryable": classification.isRetryable,
    ...(classification.statusCode !== undefined
      ? { "eval.llm.error.status_code": classification.statusCode }
      : {}),
    ...(retryError
      ? {
          "eval.llm.retry.reason": retryError.reason,
          "eval.llm.retry.attempt_count": retryError.errors.length,
        }
      : {}),
    "eval.llm.blocked": classification.blockReason !== null,
    ...(classification.blockReason
      ? {
          "eval.llm.block.reason": classification.blockReason,
          "eval.llm.block.source": EvaluatorBlockSource.LLM_COMPLETION_ERROR,
        }
      : {}),
  };
};
