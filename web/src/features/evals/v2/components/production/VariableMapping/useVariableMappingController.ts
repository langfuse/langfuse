import { useState } from "react";

import { type ActiveVariableMapping } from "./VariableMapping";
import { getVariableMappingDismissalHandlers } from "./variableMappingDismissal";

/** Owns the interaction state shared by production mapping views and siblings. */
export function useVariableMappingController() {
  const [activeMapping, setActiveMapping] =
    useState<ActiveVariableMapping>(null);

  const showPreview = () =>
    setActiveMapping((current) =>
      current ? { ...current, state: "preview" } : current,
    );

  return {
    selectedVariable: activeMapping?.variable ?? null,
    editingVariable:
      activeMapping?.state === "editing" ? activeMapping.variable : null,
    editVariable: (variable: string) =>
      setActiveMapping({ variable, state: "editing" }),
    collapse: () => setActiveMapping(null),
    showPreview,
    boundaryProps: getVariableMappingDismissalHandlers(showPreview),
    mappingProps: {
      activeMapping,
      onActiveMappingChange: setActiveMapping,
    },
  };
}
