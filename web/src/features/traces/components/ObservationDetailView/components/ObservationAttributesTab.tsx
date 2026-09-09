/**
 * "Attributes" tab for ObservationDetailView: the observation's fixed-key
 * attributes as a light key/value list, followed by the free-form metadata
 * rendered with the same PrettyJsonView the Preview tab uses.
 */

import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type MediaReturnType } from "@/src/features/media/validation";
import {
  type AttributeRow,
  ObservationAttributesList,
} from "@/src/features/traces/components/ObservationAttributesList";

export function ObservationAttributesTab({
  rows,
  parsedMetadata,
  isLoading,
  isParsing,
  media,
}: {
  rows: AttributeRow[];
  parsedMetadata: unknown;
  isLoading?: boolean;
  isParsing?: boolean;
  media?: MediaReturnType[];
}) {
  return (
    <div className="flex w-full flex-col gap-6 overflow-y-auto p-2">
      <div className="px-2">
        <ObservationAttributesList rows={rows} />
      </div>

      {parsedMetadata !== undefined ? (
        <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
          <PrettyJsonView
            title="Metadata"
            json={parsedMetadata}
            isLoading={isLoading}
            isParsing={isParsing}
            media={media?.filter((m) => m.field === "metadata") ?? []}
            currentView="pretty"
            hoverControls
          />
        </div>
      ) : null}
    </div>
  );
}
