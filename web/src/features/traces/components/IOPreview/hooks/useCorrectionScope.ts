import { useState } from "react";

type CorrectionScope = "trace" | "observation";

export function useCorrectionScope(hasObservationCorrection: boolean) {
  return useState<CorrectionScope>(() =>
    hasObservationCorrection ? "observation" : "trace",
  );
}
