import type { VariableMapping } from "@/src/features/evals/utils/evaluator-form-utils";

export type VariableFieldState = {
  [Key in "selectedColumnId" | "jsonSelector"]-?: Exclude<
    VariableMapping[Key],
    undefined
  >;
} & {
  valueSource?: "observation" | "constant";
  /** JSON text kept in the form so invalid drafts remain editable. */
  constantValue?: string;
};

export type ActiveVariableMapping = {
  variable: string;
  state: "preview" | "editing" | "renaming";
} | null;
