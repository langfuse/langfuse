import type { VariableMapping } from "../../utils/evaluator-form-utils";

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
