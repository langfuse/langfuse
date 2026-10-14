import { useMemo } from "react";
import { type PromptVariable } from "@langfuse/shared";
import { type PlaceholderMessageFillIn } from "../types";

export interface NamingConflictInfo {
  hasConflicts: boolean;
  conflictingNames: string[];
  isVariableConflicting: (variableName: string) => boolean;
  isPlaceholderConflicting: (placeholderName: string) => boolean;
}

/**
 * Detects naming conflicts between variables and placeholders in the playground.
 * Returns names of conflicting variables and placeholders.
 */
export const useNamingConflicts = (
  variables: PromptVariable[],
  placeholders: PlaceholderMessageFillIn[],
): NamingConflictInfo => {
  return useMemo(() => {
    const variableNames = variables.map((v) => v.name);
    const placeholderNames = placeholders.map((p) => p.name);

    const conflictingNames = variableNames.filter((name) =>
      placeholderNames.includes(name),
    );

    const hasConflicts = conflictingNames.length > 0;

    const isVariableConflicting = (variableName: string) =>
      conflictingNames.includes(variableName);

    const isPlaceholderConflicting = (placeholderName: string) =>
      conflictingNames.includes(placeholderName);

    return {
      hasConflicts,
      conflictingNames,
      isVariableConflicting,
      isPlaceholderConflicting,
    };
  }, [variables, placeholders]);
};
