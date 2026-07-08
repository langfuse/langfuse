/**
 * Model parameters badges for ObservationDetailView
 * Renders dynamic badges for each model parameter with truncation
 */

import { type JsonNested } from "@langfuse/shared";
import { Badge } from "@/src/components/ui/badge";

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
          <Badge variant="tertiary" key={key} className="max-w-md">
            <span
              className="overflow-hidden text-ellipsis whitespace-nowrap"
              title={valueString}
            >
              {key}: {valueString}
            </span>
          </Badge>
        );
      })}
    </>
  );
}
