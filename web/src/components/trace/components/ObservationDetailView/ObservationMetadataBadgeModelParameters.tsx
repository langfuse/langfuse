/**
 * Model parameter overview-grid rows for ObservationDetailView.
 * Renders one label+value row per model parameter with truncation.
 */

import { type JsonNested } from "@langfuse/shared";
import { OverviewRow } from "@/src/components/trace/components/_shared/InspectorElements";

export function ModelParametersBadges({
  modelParameters,
}: {
  modelParameters: JsonNested | null | undefined;
}) {
  // Only render if modelParameters is an object (not array, primitive, or null)
  if (
    !modelParameters ||
    typeof modelParameters !== "object" ||
    Array.isArray(modelParameters)
  ) {
    return null;
  }

  const entries = Object.entries(modelParameters).filter(
    ([_, value]) => value !== null,
  );

  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(([key, value]) => {
        const valueString =
          Object.prototype.toString.call(value) === "[object Object]"
            ? JSON.stringify(value)
            : value?.toString();

        return (
          <OverviewRow key={key} label={key} title={valueString}>
            {valueString}
          </OverviewRow>
        );
      })}
    </>
  );
}
