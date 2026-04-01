import {
  extractValueFromObject,
  type BatchActionQuery,
  type ObservationVariableMapping,
} from "@langfuse/shared";
import { type RouterOutputs } from "@/src/utils/api";

type ObservationPreview = RouterOutputs["observations"]["byId"];

const PROMPT_PREVIEW_CHAR_LIMIT = 2000;

export function stringifyPreviewValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function renderPromptPreviewFromObservation(params: {
  prompt: string | null | undefined;
  variableMapping: ObservationVariableMapping[];
  observation: ObservationPreview;
}): string {
  const { prompt, variableMapping, observation } = params;

  if (!prompt) {
    return "Template has no prompt.";
  }

  const variableValues = new Map<string, string>();

  for (const mapping of variableMapping) {
    const { value } = extractValueFromObject(
      observation,
      mapping.selectedColumnId,
      mapping.jsonSelector ?? undefined,
    );
    variableValues.set(mapping.templateVariable, stringifyPreviewValue(value));
  }

  const renderedPrompt = prompt.replace(/{{([^{}]+)}}/g, (_match, variable) => {
    const variableName = String(variable).trim();
    return variableValues.get(variableName) ?? "";
  });

  return renderedPrompt.length > PROMPT_PREVIEW_CHAR_LIMIT
    ? `${renderedPrompt.slice(0, PROMPT_PREVIEW_CHAR_LIMIT)}...`
    : renderedPrompt;
}

export function buildQueryWithSelectedIds(params: {
  query: BatchActionQuery;
  selectAll: boolean;
  selectedObservationIds: string[];
}): BatchActionQuery {
  const { query, selectAll, selectedObservationIds } = params;

  if (selectAll) {
    return query;
  }

  return {
    ...query,
    filter: [
      ...(query.filter ?? []),
      {
        column: "id",
        operator: "any of" as const,
        value: selectedObservationIds,
        type: "stringOptions" as const,
      },
    ],
  };
}
