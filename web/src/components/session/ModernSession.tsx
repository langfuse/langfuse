import { type ComponentProps } from "react";
import { type FilterState } from "@langfuse/shared";

import { ConnectedModernSessionBodyLegacy } from "@/src/components/session/ConnectedModernSessionBodyLegacy";
import { ConnectedModernSessionBodyTimeline } from "@/src/components/session/ConnectedModernSessionBodyTimeline";
import { ModernSessionFilterControls } from "@/src/components/session/ModernSessionFilterControls";
import { ModernSessionHeader } from "@/src/components/session/ModernSessionHeader";
import { SessionMetadataJsonPathControl } from "@/src/components/session/SessionMetadataJsonPathControl";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import {
  type EventSession,
  type EventSessionTrace,
} from "@/src/components/session/sessionDetailPageTypes";

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
