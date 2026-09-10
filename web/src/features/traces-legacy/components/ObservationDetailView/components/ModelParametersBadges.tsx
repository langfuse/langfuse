/* eslint-disable @repo/no-null-render */
/**
 * Model parameters badges for ObservationDetailView
 * Renders dynamic badges for each model parameter with truncation
 */

import { type JsonNested } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";

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

        const text = `${key}: ${valueString}`;
        return (
          <span key={key} className="inline-flex max-w-md">
            <Badge text={text} title={text} />
          </span>
        );
      })}
    </>
  );
}
