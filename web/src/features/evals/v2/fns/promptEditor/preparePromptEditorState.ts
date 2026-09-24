import { extractValueFromObjectAsString } from "@langfuse/shared";

import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";
import { buildEvaluatorVariableMappings } from "@/src/features/evals/v2/fns/variableMapping/buildEvaluatorVariableMappings";
import { buildInterpolatedPromptPreview } from "@/src/features/evals/v2/fns/promptEditor/buildInterpolatedPromptPreview";
import { evalVariableColumnLabel } from "@/src/features/evals/v2/fns/variableMapping/evalVariableColumnLabel";

export function preparePromptEditorState({
  prompt,
  variableFields,
  promptPreviewEnabled,
  sampleObject,
}: {
  prompt: string;
  variableFields: Record<string, VariableFieldState>;
  promptPreviewEnabled: boolean;
  sampleObject: Record<string, unknown> | null;
}) {
  const mappings = buildEvaluatorVariableMappings({
    promptMessages: [{ role: "user", content: prompt }],
    variableFields,
  });
  const promptVariableMappings = Object.fromEntries(
    mappings.map(({ variable, fieldState }) => [
      variable,
      evalVariableColumnLabel(fieldState.selectedColumnId) ?? "",
    ]),
  );
  const promptVariableStatus = Object.fromEntries(
    mappings.map(({ variable, fieldState }) => {
      if (!fieldState.selectedColumnId) {
        return [
          variable,
          { status: "invalid" as const, message: "Not mapped to sample data" },
        ];
      }
      if (!sampleObject) {
        return [variable, { status: "valid" as const }];
      }

      const extracted = extractValueFromObjectAsString(
        sampleObject,
        fieldState.selectedColumnId,
        fieldState.jsonSelector ?? undefined,
      );
      if (extracted.error) {
        return [
          variable,
          { status: "invalid" as const, message: extracted.error.message },
        ];
      }
      return extracted.value
        ? [variable, { status: "valid" as const }]
        : [
            variable,
            {
              status: "invalid" as const,
              message: "The mapping is empty in the selected sample",
            },
          ];
    }),
  );
  const promptPreview = buildInterpolatedPromptPreview({
    prompt,
    mappings,
    sourceObject: sampleObject,
  });

  return {
    mappings,
    promptPreview,
    promptPreviewDisabledReason:
      !promptPreviewEnabled && promptPreview.status === "unavailable"
        ? promptPreview.message
        : null,
    promptVariableMappings,
    promptVariableStatus,
  };
}
