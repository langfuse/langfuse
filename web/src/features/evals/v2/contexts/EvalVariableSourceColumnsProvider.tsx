import { createContext, useContext, type ReactNode } from "react";
import {
  experimentTargetEvalVariableColumns,
  TRACE_TRANSCRIPT_EVAL_COLUMN,
} from "@langfuse/shared";

export type EvalVariableSourceColumn = { id: string; name: string };

export const TRACE_TRANSCRIPT_SOURCE_COLUMNS: readonly EvalVariableSourceColumn[] =
  [{ id: TRACE_TRANSCRIPT_EVAL_COLUMN, name: "Threads" }];

// Defaults to the observation columns, so mapping editors outside a trace
// evaluation setup keep their existing roots.
const EvalVariableSourceColumnsContext = createContext<
  readonly EvalVariableSourceColumn[]
>(experimentTargetEvalVariableColumns);

export function EvalVariableSourceColumnsProvider({
  value,
  children,
}: {
  value: readonly EvalVariableSourceColumn[];
  children: ReactNode;
}) {
  return (
    <EvalVariableSourceColumnsContext.Provider value={value}>
      {children}
    </EvalVariableSourceColumnsContext.Provider>
  );
}

/** The top-level sample fields a variable can be mapped from. */
export function useEvalVariableSourceColumns() {
  return useContext(EvalVariableSourceColumnsContext);
}
