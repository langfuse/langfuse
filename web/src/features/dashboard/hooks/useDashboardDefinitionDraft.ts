import { useCallback, useRef, useState } from "react";

import type { DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";

export type DashboardDefinition = {
  widgets: DashboardPlacement[];
};

export function useDashboardDefinitionDraft(
  serverDefinition: DashboardDefinition | null | undefined,
) {
  const [draft, setDraft] = useState<DashboardDefinition | null>(null);
  const definition = draft ?? serverDefinition ?? null;
  const definitionRef = useRef(definition);
  definitionRef.current = definition;

  const applyDraft = useCallback((updated: DashboardDefinition) => {
    definitionRef.current = updated;
    setDraft(updated);
  }, []);

  const clearDraftIfSaved = useCallback((saved: DashboardDefinition) => {
    setDraft((current) => (current === saved ? null : current));
  }, []);

  return {
    definition,
    definitionRef,
    applyDraft,
    clearDraftIfSaved,
  };
}
