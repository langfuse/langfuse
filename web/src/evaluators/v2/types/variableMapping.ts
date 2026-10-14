import type { VariableMapping } from "@/src/evaluators/utils/evaluator-form-utils";

export type VariableFieldState = {
  [Key in "selectedColumnId" | "jsonSelector"]-?: Exclude<
    VariableMapping[Key],
    undefined
  >;
};

export type ActiveVariableMapping = {
  variable: string;
  state: "preview" | "editing" | "renaming";
} | null;
