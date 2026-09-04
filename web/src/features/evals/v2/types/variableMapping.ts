import type { VariableMapping } from "@/src/features/evals/utils/evaluator-form-utils";

export type VariableFieldState = {
  [Key in "selectedColumnId" | "jsonSelector"]-?: Exclude<
    VariableMapping[Key],
    undefined
  >;
};

export type ActiveVariableMapping = {
  variable: string;
  state: "preview" | "editing";
} | null;
