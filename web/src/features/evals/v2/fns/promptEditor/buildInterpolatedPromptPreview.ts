import {
  extractValueFromObjectAsString,
  isValidVariableName,
  MUSTACHE_REGEX,
} from "@langfuse/shared";

import type { InterpolatedPromptPreviewState } from "@/src/features/evals/v2/components/Evaluators/Judges/PromptVariableEditor/PromptVariableEditor";
import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";

const SAMPLE_REQUIRED_MESSAGE =
  "Select a sample observation in the test panel to preview the interpolated prompt.";

export function buildInterpolatedPromptPreview({
  prompt,
  mappings,
  sourceObject,
}: {
  prompt: string;
  mappings: Array<{ variable: string; fieldState: VariableFieldState }>;
  sourceObject: Record<string, unknown> | null;
}): InterpolatedPromptPreviewState {
  if (!sourceObject) {
    return { status: "unavailable", message: SAMPLE_REQUIRED_MESSAGE };
  }

  const values = new Map<string, string>();
  for (const { variable, fieldState } of mappings) {
    if (!fieldState.selectedColumnId) {
      return {
        status: "unavailable",
        message: `Map {{${variable}}} to sample data before previewing the prompt.`,
      };
    }

    const extracted = extractValueFromObjectAsString(
      sourceObject,
      fieldState.selectedColumnId,
      fieldState.jsonSelector ?? undefined,
    );
    if (extracted.error) {
      return {
        status: "unavailable",
        message: `Fix the mapping for {{${variable}}} before previewing the prompt.`,
      };
    }
    values.set(variable, extracted.value);
  }

  const fragments: Extract<
    InterpolatedPromptPreviewState,
    { status: "ready" }
  >["fragments"] = [];
  let cursor = 0;

  for (const match of prompt.matchAll(MUSTACHE_REGEX)) {
    const variable = match[1];
    if (!isValidVariableName(variable)) continue;

    const start = match.index;
    if (start > cursor) {
      fragments.push({ type: "text", text: prompt.slice(cursor, start) });
    }
    fragments.push({
      type: "variable",
      name: variable,
      value: values.get(variable) ?? "",
    });
    cursor = start + match[0].length;
  }

  if (cursor < prompt.length) {
    fragments.push({ type: "text", text: prompt.slice(cursor) });
  }

  return { status: "ready", fragments };
}
