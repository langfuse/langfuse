import { useCallback, useRef, useState } from "react";

import type { DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";

export type DashboardDefinition = {
  widgets: DashboardPlacement[];
};

export function useDashboardDefinitionDraft(
  serverDefinition: DashboardDefinition | null | undefined,
) {
  const [draft, setDraft] = useState<DashboardDefinition | null>(null);
  const draftRef = useRef(draft);
  const definition = draft ?? serverDefinition ?? null;
  const definitionRef = useRef(definition);
  definitionRef.current = definition;

  const applyDraft = useCallback((updated: DashboardDefinition) => {
    draftRef.current = updated;
    definitionRef.current = updated;
    setDraft(updated);
  }, []);

  const clearDraftIfSaved = useCallback((saved: DashboardDefinition) => {
    if (draftRef.current !== saved) return false;

    draftRef.current = null;
    setDraft(null);
    return true;
  }, []);

  return {
    definition,
    definitionRef,
    applyDraft,
    clearDraftIfSaved,
  };
}
