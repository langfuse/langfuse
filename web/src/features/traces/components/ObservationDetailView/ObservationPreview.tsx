import { useState, type ComponentProps, type Key } from "react";

import { IOPreview } from "@/src/features/traces/components/IOPreview/IOPreview";
import { cn } from "@/src/utils/tailwind";

export interface ObservationPreviewProps {
  currentView?: ComponentProps<typeof IOPreview>["currentView"];
  previewKey: Key;
  previewProps: Omit<
    ComponentProps<typeof IOPreview>,
    "currentView" | "setIsPrettyViewAvailable" | "onVirtualizationChange"
  >;
  onPrettyViewAvailabilityChange?: (isAvailable: boolean) => void;
}

export function ObservationPreview({
  currentView,
  previewKey,
  previewProps,
  onPrettyViewAvailabilityChange,
}: ObservationPreviewProps) {
  const [isJSONBetaVirtualized, setIsJSONBetaVirtualized] = useState(false);

  return (
    <div
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col",
        currentView === "json-beta" && isJSONBetaVirtualized
          ? "overflow-hidden"
          : "overflow-auto pb-4",
        // The JSON beta viewer runs edge to edge with its own toolbar.
        currentView !== "json-beta" && "px-4",
      )}
    >
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
