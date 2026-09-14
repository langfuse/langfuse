import { type ComponentProps } from "react";
import { type FilterState } from "@langfuse/shared";

import { ConnectedModernSessionBodyLegacy } from "@/src/features/sessions/ConnectedModernSessionBodyLegacy";
import { ConnectedModernSessionBodyTimeline } from "@/src/features/sessions/ConnectedModernSessionBodyTimeline";
import { ModernSessionFilterControls } from "@/src/features/sessions/ModernSessionFilterControls";
import { ModernSessionHeader } from "@/src/features/sessions/ModernSessionHeader";
import { SessionMetadataJsonPathControl } from "@/src/features/sessions/SessionMetadataJsonPathControl";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import {
  type EventSession,
  type EventSessionTrace,
} from "@/src/features/sessions/sessionDetailPageTypes";
import { type SessionFocusTarget } from "@/src/features/sessions/sessionFocusTarget";

type ModernSessionProps = {
  isTimelineEnabled: boolean;
  session: Pick<
    EventSession,
    | "countTraces"
    | "inputUsage"
    | "outputUsage"
    | "totalTokens"
    | "totalCost"
    | "environment"
    | "users"
    | "scores"
    | "minTimestamp"
    | "maxTimestamp"
  >;
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
  /** Trace (and observation) the user arrived from; the body scrolls to it. */
  focusTarget?: SessionFocusTarget | null;
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
  focusTarget = null,
  filterControlsProps,
  onFilterObservationByName,
}: ModernSessionProps) {
  const isProjectMember = useIsAuthenticatedAndProjectMember(projectId);
  // Public session authorization must support timeline event queries before removing the sessionTimeline flag.
  const shouldRenderTimeline = isTimelineEnabled && isProjectMember;
  const headerTraces =
    tracesState.type === "loaded"
      ? ({ state: "loaded", data: tracesState.traces } as const)
      : ({ state: "loading" } as const);
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
    focusTarget,
    onFilterObservationByName,
  };

  return (
    <>
      <SessionMetadataJsonPathControl
        key={`${projectId}:${sessionId}`}
        projectId={projectId}
        sessionId={sessionId}
        traces={headerTraces}
        filterState={filterState}
      >
        {(metadataJsonPaths) => (
          <ModernSessionHeader
            projectId={projectId}
            countTraces={session.countTraces}
            minTimestamp={session.minTimestamp}
            maxTimestamp={session.maxTimestamp}
            traces={headerTraces}
            tokensIn={session.inputUsage}
            tokensOut={session.outputUsage}
            totalTokens={session.totalTokens}
            totalCost={session.totalCost ?? 0}
            environment={session.environment ?? null}
            users={session.users ?? []}
            metadataJsonPaths={metadataJsonPaths}
            scores={session.scores}
          />
        )}
      </SessionMetadataJsonPathControl>
      <ModernSessionFilterControls {...filterControlsProps}>
        {(sidebarFilterControls) =>
          shouldRenderTimeline ? (
            <ConnectedModernSessionBodyTimeline
              {...sharedBodyProps}
              sidebarFilterControls={sidebarFilterControls}
            />
          ) : (
            <ConnectedModernSessionBodyLegacy
              {...sharedBodyProps}
              traceCommentCounts={traceCommentCounts}
              showInlineToolCalls={showInlineToolCalls}
              showSystemPrompt={showSystemPrompt}
              sidebarFilterControls={sidebarFilterControls}
            />
          )
        }
      </ModernSessionFilterControls>
    </>
  );
}
