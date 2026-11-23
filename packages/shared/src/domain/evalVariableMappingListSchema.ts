import { z } from "zod";
import { observationVariableMapping } from "../features/evals/types";
import { getEvalVariableColumnIds } from "./getEvalVariableColumnIds";

/**
 * Variable mappings whose columns exist for the evaluation target. Stored
 * mappings are read with the unrestricted `observationVariableMappingList`;
 * this schema is for writes and execution. An empty column id is an unmapped
 * placeholder, not a column reference.
 */
export function evalVariableMappingListSchema(targetObject?: string) {
  const columnIds = getEvalVariableColumnIds(targetObject);
  return z.array(
    observationVariableMapping.superRefine(
      ({ templateVariable, selectedColumnId }, ctx) => {
        if (selectedColumnId === "" || columnIds.includes(selectedColumnId)) {
          return;
        }
        ctx.addIssue({
          code: "custom",
          path: ["selectedColumnId"],
          message: `Variable "${templateVariable}" maps to unknown column "${selectedColumnId}". Allowed columns: ${columnIds.join(", ")}.`,
        });
      },
    ),
  );
}
