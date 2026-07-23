/**
 * SessionObservationSidePanel - adapter mapping the session events queries
 * onto the consolidated TraceSidePanel presenter (variant "observation-only").
 *
 * Data comes from what the session page already loaded (the events
 * observations query + the session traces query) plus two existing endpoints
 * the trace view also uses: `events.scoresForTrace` (corrections for the
 * "Correct" toggle) and `traces.byId` (trace-level dataset prefill, fetched
 * only when that overlay opens). No query-layer rewrites.
 *
 * Mounts local ViewPreferences/JsonExpansion providers so the presenter's
 * Formatted/JSON + JSON-Beta machinery works outside the trace page.
 */

import React from "react";
import { Database, MessageSquare } from "lucide-react";
import {
  deepParseJson,
  filterAndValidateDbScoreList,
  ScoreDataTypeArray,
  ScoreDataTypeEnum,
} from "@langfuse/shared";
import { partition } from "lodash";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/src/components/ui/drawer";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { JsonExpansionProvider } from "@/src/components/trace/contexts/JsonExpansionContext";
import { ViewPreferencesProvider } from "@/src/components/trace/contexts/ViewPreferencesContext";
import {
  TraceSidePanel,
  type PlaygroundGeneration,
} from "@/src/components/trace-side-panel/TraceSidePanel";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { type SessionTraceObservation } from "@/src/components/session/SessionObservationIO";
import { CommentList } from "@/src/features/comments/CommentList";
import { useCommentedPaths } from "@/src/features/comments/hooks/useCommentedPaths";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { DualAnnotationContent } from "@/src/features/scores/components/DualAnnotationContent";
import { getMostRecentCorrection } from "@/src/features/corrections/utils/getMostRecentCorrection";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { api } from "@/src/utils/api";
import { type MetadataDomainClient } from "@/src/utils/clientSideDomainTypes";

type TraceOverlay = "dataset" | "comments" | null;

const stringifyIO = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
};

export function SessionObservationSidePanel(props: {
  observation: SessionTraceObservation;
  trace: EventSessionTrace | undefined;
  projectId: string;
  /** Optional: the session inspector shell hosts its own close control. */
  onClose?: () => void;
  onOpenTraceView?: () => void;
}) {
  return (
    <ViewPreferencesProvider traceContext="peek">
      <JsonExpansionProvider>
        <SessionObservationSidePanelInner {...props} />
      </JsonExpansionProvider>
    </ViewPreferencesProvider>
  );
}

function SessionObservationSidePanelInner({
  observation,
  trace,
  projectId,
  onClose,
  onOpenTraceView,
}: {
  observation: SessionTraceObservation;
  trace: EventSessionTrace | undefined;
  projectId: string;
  onClose?: () => void;
  onOpenTraceView?: () => void;
}) {
  const capture = usePostHogClientCapture();
  const traceId = observation.traceId ?? trace?.id ?? "";
  const [traceOverlay, setTraceOverlay] = React.useState<TraceOverlay>(null);

  const hasDatasetAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });
  const hasAnnotationAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
  const isAuthenticatedAndProjectMember =
    useIsAuthenticatedAndProjectMember(projectId);

  const parsed = React.useMemo(
    () => ({
      input: deepParseJson(observation.input, {
        maxSize: 300_000,
        maxDepth: 2,
      }),
      output: deepParseJson(observation.output, {
        maxSize: 300_000,
        maxDepth: 2,
      }),
      metadata: deepParseJson(observation.metadata, {
        maxSize: 100_000,
        maxDepth: 2,
      }),
    }),
    [observation.input, observation.output, observation.metadata],
  );

  const observationScores = React.useMemo(
    () =>
      (trace?.scores ?? []).filter(
        (score) => score.observationId === observation.id,
      ),
    [trace?.scores, observation.id],
  );
  const traceScores = React.useMemo(
    () => (trace?.scores ?? []).filter((score) => !score.observationId),
    [trace?.scores],
  );

  // Corrections for this observation (session queries strip CORRECTION scores
  // from trace.scores) — same endpoint the trace peek uses. Only needed when
  // the "Correct" toggle can render at all.
  const isGeneration = observation.type === "GENERATION";
  const correctionsQuery = api.events.scoresForTrace.useQuery(
    {
      projectId,
      traceId,
      timestamp: trace?.timestamp,
    },
    {
      enabled: Boolean(traceId) && isGeneration && hasAnnotationAccess,
      trpc: { context: { skipBatch: true } },
      staleTime: 60 * 1000,
    },
  );
  const outputCorrection = React.useMemo(() => {
    if (!correctionsQuery.data) return undefined;
    const validated = filterAndValidateDbScoreList({
      scores: correctionsQuery.data,
      dataTypes: [...ScoreDataTypeArray],
      onParseError: () => {},
    });
    const [corrections] = partition(
      validated,
      (score) => score.dataType === ScoreDataTypeEnum.CORRECTION,
    );
    return getMostRecentCorrection(
      corrections.filter((score) => score.observationId === observation.id),
    );
  }, [correctionsQuery.data, observation.id]);

  // Inline-comment highlighting (JSON Beta) — same query as the trace view.
  const observationComments = api.comments.getByObjectId.useQuery(
    {
      projectId,
      objectId: observation.id,
      objectType: "OBSERVATION",
    },
    {
      enabled: isAuthenticatedAndProjectMember,
      refetchOnMount: false,
    },
  );
  const commentedPathsByField = useCommentedPaths(observationComments.data);

  // Trace-level I/O for "Add trace to dataset" — fetched only when that
  // overlay opens (same source as the old per-trace minimap action).
  const traceForDatasetQuery = api.traces.byId.useQuery(
    {
      traceId,
      projectId,
      timestamp: trace?.timestamp ?? new Date(0),
    },
    {
      enabled: traceOverlay === "dataset" && trace !== undefined,
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
    },
  );

  const playgroundGeneration = React.useMemo<PlaygroundGeneration | null>(
    () =>
      ({
        ...observation,
        input: stringifyIO(observation.input),
        output: stringifyIO(observation.output),
      }) as unknown as PlaygroundGeneration,
    [observation],
  );

  const environment = observation.environment ?? trace?.environment;

  return (
    <>
      <TraceSidePanel
        variant="observation-only"
        projectId={projectId}
        traceId={traceId}
        observation={observation}
        io={{
          input: observation.input ?? undefined,
          output: observation.output ?? undefined,
          metadata: observation.metadata ?? undefined,
          parsedInput: parsed.input,
          parsedOutput: parsed.output,
          parsedMetadata: parsed.metadata,
          isLoading: false,
          isParsing: false,
        }}
        observationScores={observationScores}
        outputCorrection={outputCorrection}
        playgroundGeneration={playgroundGeneration}
        datasetPrefill={{
          input: parsed.input as never,
          output: parsed.output as never,
          metadata: observation.metadata as MetadataDomainClient,
        }}
        annotateContent={
          <DualAnnotationContent
            projectId={projectId}
            traceId={traceId}
            observationId={observation.id}
            traceEnvironment={trace?.environment ?? environment ?? "default"}
            observationEnvironment={observation.environment}
            observationScores={observationScores}
            traceScores={traceScores}
          />
        }
        addToMenuExtraItems={
          <>
            <DropdownMenuItem
              disabled={!hasDatasetAccess || !trace}
              onClick={() => setTraceOverlay("dataset")}
            >
              <Database className="mr-2 h-3.5 w-3.5" />
              Add trace to dataset
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!trace}
              onClick={() => setTraceOverlay("comments")}
            >
              <MessageSquare className="mr-2 h-3.5 w-3.5" />
              Comment on trace
            </DropdownMenuItem>
          </>
        }
        commentedPathsByField={commentedPathsByField}
        enableInlineComments={isAuthenticatedAndProjectMember}
        onClose={onClose}
        onOpenTraceView={onOpenTraceView}
        metadataNotice={
          // Session queries cap large metadata values (and drop metadata
          // entirely past the per-trace budget) — same hint the conversation
          // feed's SessionObservationIO shows for metadataTruncated (LFE-10958).
          observation.metadataTruncated ? (
            <p className="text-muted-foreground pb-1 text-xs">
              Some metadata values are too large to show here.{" "}
              {onOpenTraceView ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      capture(
                        "session_detail:truncated_observation_open_trace_click",
                      );
                      onOpenTraceView();
                    }}
                    className="text-primary underline underline-offset-2 hover:no-underline"
                  >
                    Open Trace View
                  </button>{" "}
                  for full metadata.
                </>
              ) : (
                <>Open the trace view for full metadata.</>
              )}
            </p>
          ) : undefined
        }
      />

      {/* Trace-level overlays opened from the "+ Add to" menu — siblings, per
          the overlay lifecycle rule (the dropdown closes before these mount). */}
      <Dialog
        open={traceOverlay === "dataset"}
        onOpenChange={(open) => setTraceOverlay(open ? "dataset" : null)}
      >
        <DialogContent className="h-[calc(100vh-5rem)] max-h-none w-[calc(100vw-5rem)] max-w-none">
          <DialogHeader>
            <DialogTitle>Add trace to datasets</DialogTitle>
          </DialogHeader>
          {traceOverlay === "dataset" && trace && traceForDatasetQuery.data ? (
            <NewDatasetItemForm
              traceId={trace.id}
              projectId={projectId}
              input={traceForDatasetQuery.data.input ?? null}
              output={traceForDatasetQuery.data.output ?? null}
              metadata={traceForDatasetQuery.data.metadata ?? null}
              onFormSuccess={() => setTraceOverlay(null)}
              className="h-full overflow-y-auto"
            />
          ) : traceOverlay === "dataset" ? (
            <JsonSkeleton className="h-40 w-full" numRows={4} />
          ) : null}
        </DialogContent>
      </Dialog>
      <Drawer
        open={traceOverlay === "comments"}
        onOpenChange={(open) => setTraceOverlay(open ? "comments" : null)}
      >
        <DrawerContent className="p-3">
          <DrawerHeader className="p-0 pb-2">
            <DrawerTitle>Trace comments</DrawerTitle>
          </DrawerHeader>
          {traceOverlay === "comments" && trace ? (
            <CommentList
              projectId={projectId}
              objectId={trace.id}
              objectType="TRACE"
              isDrawerOpen
            />
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}
