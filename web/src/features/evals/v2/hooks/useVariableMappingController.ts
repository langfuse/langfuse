import { useState, type KeyboardEvent, type MouseEvent } from "react";

import type { ActiveVariableMapping } from "@/src/features/evals/v2/types/variableMapping";

const VARIABLE_MAPPING_ROOT_SELECTOR = "[data-variable-mapping-root]";

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
    boundaryProps: {
      onClick: (event: MouseEvent<HTMLElement>) => {
        if (
          event.target instanceof Element &&
          !event.target.closest(VARIABLE_MAPPING_ROOT_SELECTOR)
        ) {
          showPreview();
        }
      },
      onKeyDownCapture: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === "Escape") showPreview();
      },
    },
    mappingProps: {
      activeMapping,
      onActiveMappingChange: setActiveMapping,
    },
  };
}
