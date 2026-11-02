import { useState } from "react";

/** Keep the column available once expected output has been found in a selection. */
export function useExpectedOutputVisibility(
  selectionKey: string,
  hasExpectedOutput: boolean,
  ioLoading: boolean,
) {
  const [seen, setSeen] = useState({ selectionKey, hasExpectedOutput: false });
  const hasLoadedExpectedOutput = !ioLoading && hasExpectedOutput;
  const visible =
    hasLoadedExpectedOutput ||
    (seen.selectionKey === selectionKey && seen.hasExpectedOutput);

  if (
    seen.selectionKey !== selectionKey ||
    seen.hasExpectedOutput !== visible
  ) {
    setSeen({ selectionKey, hasExpectedOutput: visible });
  }

  return visible;
}
