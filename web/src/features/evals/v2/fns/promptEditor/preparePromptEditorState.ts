import {
  type CodeEvalTemplateVariable,
  extractValueFromObjectAsString,
} from "@langfuse/shared";

import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";
import { buildEvaluatorVariableMappings } from "@/src/features/evals/v2/fns/variableMapping/buildEvaluatorVariableMappings";
import { buildInterpolatedPromptPreview } from "@/src/features/evals/v2/fns/promptEditor/buildInterpolatedPromptPreview";
import { evalVariableColumnLabel } from "@/src/features/evals/v2/fns/variableMapping/evalVariableColumnLabel";

export function preparePromptEditorState({
  prompt,
  variableFields,
  promptPreviewEnabled,
  sampleObject,
  columnLabels,
  messages,
}: {
  prompt: string;
  variableFields: Record<string, VariableFieldState>;
  promptPreviewEnabled: boolean;
  sampleObject: Record<string, unknown> | null;
  columnLabels?: Partial<Record<CodeEvalTemplateVariable, string>>;
  messages?: {
    notMapped: string;
    emptyMapping: string;
    sampleRequired: string;
    mapVariable: (variable: string) => string;
    fixVariable: (variable: string) => string;
  };
}) {
  const mappings = buildEvaluatorVariableMappings({
    promptMessages: [{ role: "user", content: prompt }],
    variableFields,
  });
  const promptVariableMappings = Object.fromEntries(
    mappings.map(({ variable, fieldState }) => [
      variable,
      evalVariableColumnLabel(fieldState.selectedColumnId, columnLabels) ?? "",
    ]),
  );
  const promptVariableStatus = Object.fromEntries(
    mappings.map(({ variable, fieldState }) => {
      if (!fieldState.selectedColumnId) {
        return [
          variable,
          {
            status: "invalid" as const,
            message: messages?.notMapped ?? "Not mapped to sample data",
          },
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
              message:
                messages?.emptyMapping ??
                "The mapping is empty in the selected sample",
            },
          ];
    }),
  );
  const promptPreview = buildInterpolatedPromptPreview({
    prompt,
    mappings,
    sourceObject: sampleObject,
    messages: messages
      ? {
          sampleRequired: messages.sampleRequired,
          mapVariable: messages.mapVariable,
          fixVariable: messages.fixVariable,
        }
      : undefined,
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
