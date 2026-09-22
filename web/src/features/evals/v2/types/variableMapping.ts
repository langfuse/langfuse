import type { VariableMapping } from "@/src/features/evals/utils/evaluator-form-utils";

export type VariableFieldState = {
  [Key in "selectedColumnId" | "jsonSelector"]-?: Exclude<
    VariableMapping[Key],
    undefined
  >;
};

export type ActiveVariableMapping = {
  variable: string;
  /** `renaming` edits the name itself; only state keys of decision models allow it. */
  state: "preview" | "editing" | "renaming";
} | null;
