import type { FilterCondition, FilterState } from "../../types";

export const OBSERVATION_IO_PARSER_BLOCKED_FILTER_COLUMNS = new Set([
  "input",
  "output",
  "metadata",
]);

export const OBSERVATION_IO_PARSER_SUPPORTED_FILTER_COLUMNS = new Set([
  "id",
  "traceId",
  "type",
  "name",
  "startTime",
  "endTime",
  "timeToFirstToken",
  "latency",
  "tokensPerSecond",
  "inputCost",
  "outputCost",
  "totalCost",
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "level",
  "statusMessage",
  "model",
  "providedModelName",
  "modelId",
  "version",
  "promptName",
  "promptVersion",
  "sessionId",
  "traceName",
  "userId",
  "traceTags",
  "tags",
  "environment",
  "parentObservationId",
  "hasParentObservation",
  "isRootObservation",
  "toolDefinitions",
  "toolCalls",
  "toolNames",
  "calledToolNames",
]);

export type ObservationIoParserFilterValidationError = {
  index: number;
  column: string;
  message: string;
};

const isBlockedObjectFilter = (condition: FilterCondition): boolean =>
  (condition.type === "stringObject" ||
    condition.type === "numberObject" ||
    condition.type === "categoryOptions") &&
  (condition.column === "metadata" ||
    condition.column === "scores" ||
    condition.column === "commentContent");

export function getObservationIoParserFilterValidationErrors(
  filters: FilterState,
): ObservationIoParserFilterValidationError[] {
  return filters.flatMap((condition, index) => {
    const errors: ObservationIoParserFilterValidationError[] = [];
    let isExplicitlyRejected = false;

    if (OBSERVATION_IO_PARSER_BLOCKED_FILTER_COLUMNS.has(condition.column)) {
      errors.push({
        index,
        column: condition.column,
        message: `Column "${condition.column}" cannot be used by IO parser filters.`,
      });
      isExplicitlyRejected = true;
    }

    if (condition.type === "positionInTrace") {
      errors.push({
        index,
        column: condition.column,
        message: "Position-in-trace filters are not supported for IO parsers.",
      });
      isExplicitlyRejected = true;
    }

    if (!isExplicitlyRejected && isBlockedObjectFilter(condition)) {
      errors.push({
        index,
        column: condition.column,
        message: `Column "${condition.column}" cannot be used by IO parser filters.`,
      });
      isExplicitlyRejected = true;
    }

    if (
      !isExplicitlyRejected &&
      !OBSERVATION_IO_PARSER_SUPPORTED_FILTER_COLUMNS.has(condition.column)
    ) {
      errors.push({
        index,
        column: condition.column,
        message: `Column "${condition.column}" is not supported for IO parser filters.`,
      });
    }

    return errors;
  });
}

export function validateObservationIoParserFilters(filters: FilterState): void {
  const errors = getObservationIoParserFilterValidationErrors(filters);
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join(" "));
  }
}
