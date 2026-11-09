import { useState } from "react";

export const LARGE_DATASET_CONFIRMATION = {
  type: "confirmation" as const,
  title: "Large Dataset Warning",
  description:
    "This chart has more than 2,000 unique data points. Rendering it may be slow or may crash your browser. Try to reduce the number of dimensions by adding more selective filters or choosing a coarser breakdown dimension.",
  actionLabel: "I understand, proceed to render the chart",
};

export function useLargeDatasetGuard(
  pointCount: number,
  overrideWarning: boolean,
) {
  const [forceRender, setForceRender] = useState(overrideWarning);
  return {
    shouldWarn: pointCount > 2000 && !forceRender,
    proceed: () => setForceRender(true),
  };
}
