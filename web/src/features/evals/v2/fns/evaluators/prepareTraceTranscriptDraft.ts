import {
  TRACE_TRANSCRIPT_EVAL_COLUMN,
  type ObservationVariableMapping,
} from "@langfuse/shared";

import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import type { EvaluatorSetupStoreState } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";

type TraceTranscriptDraftState = Parameters<typeof prepareEvaluatorDraft>[0] &
  Pick<EvaluatorSetupStoreState, "traceVariableFields">;

/**
 * Trace-scope bindings: every variable reads `threads`, optionally narrowed
 * by a JSONPath.
 */
function traceTranscriptVariableFields(
  variables: string[],
  traceVariableFields: Record<string, VariableFieldState>,
) {
  return Object.fromEntries(
    variables.map((variable) => [
      variable,
      {
        selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
        jsonSelector: traceVariableFields[variable]?.jsonSelector ?? null,
      },
    ]),
  );
}

/**
 * The trace test runs with the `threads` mapping, which the trace rule stores
 * on its assignment. The saved evaluator keeps observation columns so
 * observation rules and API reads never see `threads`.
 */
export function prepareTraceTranscriptDraft(params: TraceTranscriptDraftState) {
  const variables = prepareEvaluatorDraft(params).mappings.map(
    ({ variable }) => variable,
  );
  const traceDraft = prepareEvaluatorDraft({
    ...params,
    variableFields: traceTranscriptVariableFields(
      variables,
      params.traceVariableFields,
    ),
  });
  const traceVariableMapping: ObservationVariableMapping[] =
    traceDraft.mappings.map(({ variable, fieldState }) => ({
      templateVariable: variable,
      selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
      jsonSelector: fieldState.jsonSelector,
    }));
  // A decision model needs every state key mapped before it can be saved.
  const observationFields =
    params.type === "DECISION_MODEL"
      ? Object.fromEntries(
          prepareEvaluatorDraft(params).mappings.map(
            ({ variable, fieldState }) => [
              variable,
              fieldState.selectedColumnId
                ? fieldState
                : { selectedColumnId: "input", jsonSelector: null },
            ],
          ),
        )
      : params.variableFields;
  const definition = traceDraft.definition
    ? prepareEvaluatorDraft({ ...params, variableFields: observationFields })
        .definition
    : null;

  return {
    definition,
    testDefinition: traceDraft.definition,
    mappings: traceDraft.mappings,
    traceVariableMapping,
  };
}
