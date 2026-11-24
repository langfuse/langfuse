import { createContext, use, type ReactNode } from "react";

import { useTracePresentation } from "@/src/features/traces/contexts/TracePresentationProvider";
import { type TreeNode } from "@/src/features/traces/types/treeNode";

export type ObservationEvaluationHint = "tested" | "also";

const ObservationEvaluationHintsContext = createContext<ReadonlyMap<
  string,
  ObservationEvaluationHint
> | null>(null);

/** Read-only: marks which observations of an embedded trace a rule will evaluate. */
export function ObservationEvaluationHintsProvider({
  hints,
  children,
}: {
  hints: ReadonlyMap<string, ObservationEvaluationHint>;
  children: ReactNode;
}) {
  return (
    <ObservationEvaluationHintsContext.Provider value={hints}>
      {children}
    </ObservationEvaluationHintsContext.Provider>
  );
}

/** Null outside an embedded trace view. */
export function useObservationEvaluationHint(node: TreeNode) {
  const { isEmbedded } = useTracePresentation();
  const hints = use(ObservationEvaluationHintsContext);
  if (!isEmbedded || !hints || node.type === "TRACE") return null;
  return hints.get(node.observationId ?? node.id) ?? null;
}
