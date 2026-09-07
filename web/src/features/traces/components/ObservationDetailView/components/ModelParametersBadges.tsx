/**
 * Model parameters badges for ObservationDetailView
 * Renders dynamic badges for each model parameter with truncation
 */

import { type JsonNested } from "@langfuse/shared";
import { Badge } from "@/src/components/design-system/Badge/Badge";

export function ModelParametersBadges({
  entries,
}: {
  entries: [string, JsonNested][];
}) {
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
