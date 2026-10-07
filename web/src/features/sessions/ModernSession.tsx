import { type ComponentProps, useEffect, useState } from "react";
import { type FilterState } from "@langfuse/shared";

import { ConnectedModernSessionBodyLegacy } from "@/src/features/sessions/ConnectedModernSessionBodyLegacy";
import { ConnectedModernSessionBodyTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/ConnectedModernSessionBodyTimeline";
import { ModernSessionFilterControls } from "@/src/features/sessions/ModernSessionFilterControls";
import { ModernSessionHeader } from "@/src/features/sessions/ModernSessionHeader";
import {
  SESSION_INTRODUCTION_STORAGE_KEY,
  SessionIntroductionDialogController,
} from "@/src/features/sessions/SessionIntroductionDialogController";
import { Button } from "@/src/components/ui/button";
import { Sparkles } from "lucide-react";
import { SessionReviewLeading } from "@/src/features/sessions/sessionReviewLeading";
import { SessionMetadataJsonPathControl } from "@/src/features/sessions/SessionMetadataJsonPathControl";
import {
  type EventSession,
  type EventSessionTrace,
} from "@/src/features/sessions/sessionDetailPageTypes";

type ModernSessionProps = {
  isTimelineEnabled: boolean;
  session: Pick<
    EventSession,
    | "countTraces"
    | "inputUsage"
    | "outputUsage"
    | "totalTokens"
    | "totalCost"
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
  const [hasDismissedSessionIntroduction, setHasDismissedSessionIntroduction] =
    useState<boolean>();

  useEffect(() => {
    if (!isTimelineEnabled) return;

    try {
      setHasDismissedSessionIntroduction(
        localStorage.getItem(SESSION_INTRODUCTION_STORAGE_KEY) === "true",
      );
    } catch {
      setHasDismissedSessionIntroduction(false);
    }
  }, [isTimelineEnabled]);

  const handleSessionIntroductionDismiss = () => {
    setHasDismissedSessionIntroduction(true);
  };

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
          <SessionReviewLeading>
            <div className="flex min-w-0 items-center gap-2">
              <div className="min-w-0 flex-1">
                <ModernSessionHeader
                  projectId={projectId}
                  countTraces={session.countTraces}
                  minTimestamp={session.minTimestamp}
                  maxTimestamp={session.maxTimestamp}
                  tokensIn={session.inputUsage}
                  tokensOut={session.outputUsage}
                  totalTokens={session.totalTokens}
                  totalCost={session.totalCost ?? 0}
                  users={session.users ?? []}
                  metadataJsonPaths={metadataJsonPaths}
                  scores={session.scores}
                />
              </div>
              {isTimelineEnabled &&
              hasDismissedSessionIntroduction !== undefined ? (
                <SessionIntroductionDialogController
                  initiallyDismissed={hasDismissedSessionIntroduction}
                  onDismiss={handleSessionIntroductionDismiss}
                >
                  {({ hasDismissed, openDialog }) =>
                    hasDismissed ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0"
                        onClick={openDialog}
                      >
                        <Sparkles className="icon-sm" />
                        What&apos;s new
                      </Button>
                    ) : null
                  }
                </SessionIntroductionDialogController>
              ) : null}
            </div>
          </SessionReviewLeading>
        )}
      </SessionMetadataJsonPathControl>
      {isTimelineEnabled ? (
        <ConnectedModernSessionBodyTimeline
          tracesState={tracesState}
          projectId={projectId}
          sessionId={sessionId}
          openPeek={openPeek}
        />
      ) : (
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
