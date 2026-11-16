import { type ComponentProps } from "react";
import { ConnectedSessionListBody } from "@/src/features/sessions/ConnectedSessionListBody";
import { SessionFiltersBanner } from "@/src/features/sessions/SessionFiltersBanner";
import { SessionViewTabs } from "@/src/features/sessions/SessionViewTabs";
import { Button } from "@/src/components/design-system/Button/Button";
import { type FilterState } from "@langfuse/shared";

import { ConnectedModernSessionBodyLegacy } from "@/src/features/sessions/ConnectedModernSessionBodyLegacy";
import { ConnectedModernSessionBodyTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/ConnectedModernSessionBodyTimeline";
import { ModernSessionFilterControls } from "@/src/features/sessions/ModernSessionFilterControls";
import {
  type EventSession,
  type EventSessionTrace,
} from "@/src/features/sessions/sessionDetailPageTypes";

type ModernSessionProps = {
  viewMode: "conversational" | "list";
  viewTabs: ComponentProps<typeof SessionViewTabs>;
  onSaveView?: () => void;
  customization?: NonNullable<
    ComponentProps<typeof ConnectedModernSessionBodyTimeline>["customization"]
  > & {
    onClearFilters: () => void;
  };
  isTimelineEnabled: boolean;
  session: Pick<EventSession, "minTimestamp" | "maxTimestamp">;
  tracesState:
    | { type: "loading" }
    | { type: "loaded"; traces: EventSessionTrace[] };
  projectId: string;
  sessionId: string;
  openPeek: (id: string, row: EventSessionTrace) => void;
  traceCommentCounts: Map<string, number> | undefined;
  filterState: FilterState;
  filterMeasurementKey: string;
  viewLabel: string | null;
  showInlineToolCalls: boolean;
  showSystemPrompt: boolean;
  filterControlsProps: Omit<
    ComponentProps<typeof ModernSessionFilterControls>,
    "children"
  >;
  onFilterObservationByName: (
    name: string,
    operator: "any of" | "none of",
  ) => void;
};

export function ModernSession({
  viewMode,
  viewTabs,
  onSaveView,
  customization,
  isTimelineEnabled,
  session,
  tracesState,
  projectId,
  sessionId,
  openPeek,
  traceCommentCounts,
  filterState,
  filterMeasurementKey,
  viewLabel,
  showInlineToolCalls,
  showSystemPrompt,
  filterControlsProps,
  onFilterObservationByName,
}: ModernSessionProps) {
  const sharedBodyProps = {
    tracesState,
    projectId,
    sessionId,
    sessionMinTimestamp: session.minTimestamp,
    sessionMaxTimestamp: session.maxTimestamp,
    openPeek,
    filterState,
    filterMeasurementKey,
    viewLabel,
    onFilterObservationByName,
  };
  const emptyViewHeading =
    viewTabs.savedViews.length > 0 ? "Choose a view" : "No pinned views";
  const filterBannerMessage = (() => {
    if (viewTabs.value !== "messages" && viewTabs.value !== "unsaved") {
      return "A custom view is active. Some session data may be hidden.";
    }
    if (customization && customization.activeFilterCount > 0) {
      return "Filters are active. Some session data may be hidden.";
    }
    return "You are viewing a custom session view.";
  })();

  return (
    <>
      {isTimelineEnabled && <SessionViewTabs {...viewTabs} />}
      {isTimelineEnabled && viewTabs.value === "" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <h2 className="text-lg font-bold">{emptyViewHeading}</h2>
          <p className="text-muted-foreground text-sm">
            Pin Messages or a saved view to explore this session, or create a
            custom view.
          </p>
          <Button
            text="Manage views"
            variant="outline"
            onClick={viewTabs.onManageViews}
          />
        </div>
      ) : (
        <>
          {customization &&
            (customization.activeFilterCount > 0 ||
              viewTabs.value !== "messages") && (
              <SessionFiltersBanner
                onEdit={customization.onCustomizeView}
                onClear={
                  viewTabs.value === "unsaved"
                    ? customization.onClearFilters
                    : undefined
                }
                onSave={onSaveView}
                message={filterBannerMessage}
              />
            )}
          {isTimelineEnabled && viewMode === "list" && (
            <ConnectedSessionListBody
              {...sharedBodyProps}
              traceCommentCounts={traceCommentCounts}
              filterState={filterState.filter(
                (filter) => filter.column !== "traceName",
              )}
              viewLabel={null}
              showInlineToolCalls={true}
              showSystemPrompt={true}
              onCustomizeView={customization?.onCustomizeView}
              activeFilterCount={
                customization?.activeFilterCount ?? filterState.length
              }
            />
          )}
          {isTimelineEnabled && viewMode === "conversational" && (
            <ConnectedModernSessionBodyTimeline
              customization={customization}
              tracesState={tracesState}
              projectId={projectId}
              sessionId={sessionId}
              openPeek={openPeek}
              filterState={filterState}
            />
          )}
          {!isTimelineEnabled && (
            <ModernSessionFilterControls {...filterControlsProps}>
              {(sidebarFilterControls) => (
                <ConnectedModernSessionBodyLegacy
                  {...sharedBodyProps}
                  traceCommentCounts={traceCommentCounts}
                  showInlineToolCalls={showInlineToolCalls}
                  showSystemPrompt={showSystemPrompt}
                  sidebarFilterControls={sidebarFilterControls}
                />
              )}
            </ModernSessionFilterControls>
          )}
        </>
      )}
    </>
  );
}
