import { useState, type ComponentProps, type Key } from "react";

import { IOPreview } from "@/src/features/traces/components/IOPreview/IOPreview";
import TagList from "@/src/features/tag/components/TagList";

export interface ObservationPreviewProps {
  currentView?: ComponentProps<typeof IOPreview>["currentView"];
  tags?: string[] | null;
  previewKey: Key;
  previewProps: Omit<
    ComponentProps<typeof IOPreview>,
    "currentView" | "setIsPrettyViewAvailable" | "onVirtualizationChange"
  >;
  onPrettyViewAvailabilityChange?: (isAvailable: boolean) => void;
}

export function ObservationPreview({
  currentView,
  tags,
  previewKey,
  previewProps,
  onPrettyViewAvailabilityChange,
}: ObservationPreviewProps) {
  const [isJSONBetaVirtualized, setIsJSONBetaVirtualized] = useState(false);

  return (
    <div
      className={`flex min-h-0 w-full flex-1 flex-col ${
        currentView === "json-beta" && isJSONBetaVirtualized
          ? "overflow-hidden"
          : "overflow-auto pb-4"
      }`}
    >
      {tags && tags.length > 0 ? (
        <>
          <div
            className={`px-2 pt-2 text-sm font-bold ${currentView && currentView !== "pretty" && currentView !== "pretty-beta" ? "shrink-0" : ""}`}
          >
            Tags
          </div>
          <div
            className={`flex flex-wrap gap-x-1 gap-y-1 px-2 pb-2 ${currentView && currentView !== "pretty" && currentView !== "pretty-beta" ? "shrink-0" : ""}`}
          >
            <TagList selectedTags={tags} isLoading={false} />
          </div>
        </>
      ) : null}
      <IOPreview
        key={previewKey}
        {...previewProps}
        currentView={currentView}
        setIsPrettyViewAvailable={onPrettyViewAvailabilityChange}
        onVirtualizationChange={setIsJSONBetaVirtualized}
      />
      {currentView !== "json-beta" ? (
        <div className="h-4 w-full shrink-0" />
      ) : null}
    </div>
  );
}
