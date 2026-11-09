import { type ComponentProps } from "react";
import { ConnectedSessionListBody } from "@/src/features/sessions/ConnectedSessionListBody";
import { SessionFiltersBanner } from "@/src/features/sessions/SessionFiltersBanner";
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

  return (
    <>
      {customization && customization.activeFilterCount > 0 && (
        <SessionFiltersBanner
          onEdit={customization.onCustomizeView}
          onClear={customization.onClearFilters}
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
  );
}
