import {
  TRACE_TRANSCRIPT_EVAL_COLUMN,
  type ObservationVariableMapping,
} from "@langfuse/shared";

import { prepareEvaluatorDraft } from "@/src/features/evals/v2/fns/evaluators/prepareEvaluatorDraft";
import { TRACE_TRANSCRIPT_DEFAULT_JSON_SELECTOR } from "@/src/features/evals/v2/fns/rules/traceTranscriptAssignments";
import {
  selectSampleScope,
  type EvaluatorSetupStoreState,
} from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import type { VariableFieldState } from "@/src/features/evals/v2/types/variableMapping";

type TraceTranscriptDraftState = Parameters<typeof prepareEvaluatorDraft>[0] &
  Pick<EvaluatorSetupStoreState, "traceVariableFields">;

type ScopedDraftState = TraceTranscriptDraftState &
  Pick<EvaluatorSetupStoreState, "sampleScope">;

/**
 * Trace-scope bindings: every variable reads `threads`, narrowed by a
 * JSONPath. Unset variables start on the first thread's messages.
 */
function traceTranscriptVariableFields(
  variables: string[],
  traceVariableFields: Record<string, VariableFieldState>,
) {
  return Object.fromEntries(
    variables.map((variable) => {
      const field = traceVariableFields[variable];
      return [
        variable,
        {
          selectedColumnId: TRACE_TRANSCRIPT_EVAL_COLUMN,
          jsonSelector: field
            ? field.jsonSelector
            : TRACE_TRANSCRIPT_DEFAULT_JSON_SELECTOR,
        },
      ];
    }),
  );
}

/**
 * Tests and trace rules use the `threads` mapping; the saved evaluator keeps
 * observation columns so observation rules and API reads never see `threads`.
 */
function prepareTraceTranscriptDraft(params: TraceTranscriptDraftState) {
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
    scope: "trace" as const,
    definition,
    testDefinition: traceDraft.definition,
    mappings: traceDraft.mappings,
    traceVariableMapping,
  };
}

/**
 * The saved definition, the definition the test runs with, and the variable
 * mappings for the sample scope the setup store is in.
 */
export function prepareDraftForScope(state: ScopedDraftState) {
  if (selectSampleScope(state) === "trace") {
    return prepareTraceTranscriptDraft(state);
  }
  const { definition, mappings } = prepareEvaluatorDraft(state);
  return {
    scope: "observation" as const,
    definition,
    testDefinition: definition,
    mappings,
    traceVariableMapping: null,
  };
}
