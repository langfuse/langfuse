import { createContext, use, useMemo, type ReactNode } from "react";

export type ObservationEvaluationHint = "tested" | "also" | "skipped";

type ObservationEvaluationHintsValue = {
  hintFor: (observationId: string) => ObservationEvaluationHint | null;
  onEvaluateInstead: (observationId: string) => void;
};

const ObservationEvaluationHintsContext =
  createContext<ObservationEvaluationHintsValue | null>(null);

export function ObservationEvaluationHintsProvider({
  hints,
  onEvaluateInstead,
  children,
}: {
  hints: Map<string, ObservationEvaluationHint>;
  onEvaluateInstead: (observationId: string) => void;
  children: ReactNode;
}) {
  const value = useMemo<ObservationEvaluationHintsValue>(
    () => ({
      hintFor: (observationId) => hints.get(observationId) ?? null,
      onEvaluateInstead,
    }),
    [hints, onEvaluateInstead],
  );
  return (
    <ObservationEvaluationHintsContext.Provider value={value}>
      {children}
    </ObservationEvaluationHintsContext.Provider>
  );
}

export function useObservationEvaluationHints() {
  return use(ObservationEvaluationHintsContext);
}
