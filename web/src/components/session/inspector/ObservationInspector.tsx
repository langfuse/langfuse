import React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ChevronDown,
  Copy,
  Database,
  ExternalLink,
  MessageSquare,
  MoreVertical,
  Plus,
  SquarePen,
  X,
} from "lucide-react";
import { type FilterState } from "@langfuse/shared";

import { Button } from "@/src/components/ui/button";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { Layer } from "@/src/components/ui/layer";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { useSessionDetailStore } from "@/src/components/session/SessionDetailStoreProvider";
import { SessionObservationSidePanel } from "@/src/components/session/inspector/SessionObservationSidePanel";
import {
  OverviewGrid,
  OverviewRow,
  ZoneDivider,
} from "@/src/components/trace/components/_shared/InspectorElements";
import { ScoresAccordion } from "@/src/components/trace/components/_shared/DetailAccordions";
import { CommentList } from "@/src/features/comments/CommentList";
import { NewDatasetItemForm } from "@/src/features/datasets/components/NewDatasetItemForm";
import { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api, type RouterOutputs } from "@/src/utils/api";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import { formatIntervalSeconds } from "@/src/utils/dates";

type OpenPeek = (id: string, row: any) => void;

type TraceOverlay = "traceDataset" | "traceComments" | "traceAnnotate" | null;

/**
 * Trace/turn variant of the inspector, opened by clicking a turn card in the
 * observation list: trace identity (name, id, timestamp), overview metrics
 * (latency, env, user, spans), all of the turn's scores, and trace-level
 * actions (dataset / annotate / comment / peek).
 */
const TraceInspectorContent = ({
  trace,
  projectId,
  sessionId,
  openPeek,
}: {
  trace: EventSessionTrace;
  projectId: string;
  sessionId: string;
  openPeek: OpenPeek;
}) => {
  const [overlay, setOverlay] = React.useState<TraceOverlay>(null);
  const hasAnnotationAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
  const hasDatasetAccess = useHasProjectAccess({
    projectId,
    scope: "datasets:CUD",
  });
  const traceForDatasetQuery = api.traces.byId.useQuery(
    { traceId: trace.id, projectId, timestamp: trace.timestamp },
    {
      enabled: overlay === "traceDataset",
      trpc: { context: { skipBatch: true } },
      refetchOnMount: false,
    },
  );

  return (
    <>
      <div className="flex flex-col gap-3 px-4 pt-3.5 pb-3">
        <div className="flex items-start gap-2">
          <span className="bg-muted text-foreground mt-0.5 shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide uppercase">
            Trace
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="truncate text-sm font-bold"
              title={trace.name ?? trace.id}
            >
              {trace.name ?? "Trace"}
            </div>
            <div
              className="text-muted-foreground truncate font-mono text-[10px]"
              title={trace.id}
            >
              {trace.id}
            </div>
            <LocalIsoDate
              date={trace.timestamp}
              accuracy="millisecond"
              className="text-muted-foreground font-mono text-[10px]"
            />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-2.5">
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add to
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  disabled={!hasDatasetAccess}
                  onClick={() => setOverlay("traceDataset")}
                >
                  <Database className="mr-2 h-3.5 w-3.5" />
                  Add to dataset
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasAnnotationAccess}
                  onClick={() => setOverlay("traceAnnotate")}
                >
                  <SquarePen className="mr-2 h-3.5 w-3.5" />
                  Annotate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOverlay("traceComments")}>
                  <MessageSquare className="mr-2 h-3.5 w-3.5" />
                  Add comment
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="More actions"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openPeek(trace.id, trace)}>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  Open Trace View
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => copyTextToClipboard(trace.id)}>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy trace ID
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <OverviewGrid>
          {trace.latencyMs !== null && trace.latencyMs > 0 ? (
            <OverviewRow label="Latency">
              {formatIntervalSeconds(trace.latencyMs / 1000)}
            </OverviewRow>
          ) : null}
          {trace.environment ? (
            <OverviewRow label="Env" title={trace.environment}>
              {trace.environment}
            </OverviewRow>
          ) : null}
          {trace.userId ? (
            <OverviewRow label="User" title={trace.userId}>
              <Link
                href={`/project/${projectId}/users/${encodeURIComponent(trace.userId)}`}
                className="hover:text-primary inline-flex max-w-full items-center gap-0.5"
              >
                <span className="truncate" title={trace.userId}>
                  {trace.userId}
                </span>
                <ArrowUpRight className="h-3 w-3 shrink-0" />
              </Link>
            </OverviewRow>
          ) : null}
          <OverviewRow label="Spans">{trace.observationCount ?? 0}</OverviewRow>
          <OverviewRow label="Session" title={sessionId}>
            <Link
              href={`/project/${projectId}/sessions/${encodeURIComponent(sessionId)}`}
              className="hover:text-primary inline-flex max-w-full items-center gap-0.5"
            >
              <span className="truncate" title={sessionId}>
                {sessionId}
              </span>
              <ArrowUpRight className="h-3 w-3 shrink-0" />
            </Link>
          </OverviewRow>
        </OverviewGrid>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ZoneDivider />
        <div className="px-4 pt-1 pb-4">
          <ScoresAccordion
            scores={trace.scores}
            onAddScore={() => setOverlay("traceAnnotate")}
            hasAnnotationAccess={hasAnnotationAccess}
          />
        </div>
      </div>
      <Dialog
        open={overlay === "traceDataset"}
        onOpenChange={(open) => setOverlay(open ? "traceDataset" : null)}
      >
        <DialogContent className="h-[calc(100vh-5rem)] max-h-none w-[calc(100vw-5rem)] max-w-none">
          <DialogHeader>
            <DialogTitle>Add trace to datasets</DialogTitle>
          </DialogHeader>
          {overlay === "traceDataset" && traceForDatasetQuery.data ? (
            <NewDatasetItemForm
              traceId={trace.id}
              projectId={projectId}
              input={traceForDatasetQuery.data.input ?? null}
              output={traceForDatasetQuery.data.output ?? null}
              metadata={traceForDatasetQuery.data.metadata ?? null}
              onFormSuccess={() => setOverlay(null)}
              className="h-full overflow-y-auto"
            />
          ) : overlay === "traceDataset" ? (
            <JsonSkeleton className="h-40 w-full" numRows={4} />
          ) : null}
        </DialogContent>
      </Dialog>
      <Drawer
        open={overlay === "traceAnnotate"}
        onOpenChange={(open) => setOverlay(open ? "traceAnnotate" : null)}
      >
        <DrawerContent className="p-3">
          {overlay === "traceAnnotate" ? (
            <AnnotationForm
              scoreTarget={{ type: "trace", traceId: trace.id }}
              serverScores={trace.scores.filter(
                (score) => !score.observationId,
              )}
              scoreMetadata={{
                projectId,
                environment: trace.environment ?? "default",
              }}
            />
          ) : null}
        </DrawerContent>
      </Drawer>
      <Drawer
        open={overlay === "traceComments"}
        onOpenChange={(open) => setOverlay(open ? "traceComments" : null)}
      >
        <DrawerContent className="p-3">
          <DrawerHeader className="p-0 pb-2">
            <DrawerTitle>Trace comments</DrawerTitle>
          </DrawerHeader>
          {overlay === "traceComments" ? (
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
};

/**
 * Right-hand observation inspector for the Modern Session view.
 *
 * A FLOATING OVERLAY (per the designer's override of the handoff's reflow):
 * slides in over the conversation feed when an observation is selected — no
 * scrim; a transparent click-catcher over the feed closes it, as do Esc and
 * ✕. The span rail sits above the catcher (z-20 > z-10) so rail clicks swap
 * the inspector content instead of merely closing it.
 * Observation details render through the consolidated TraceSidePanel
 * (variant "observation-only") via the SessionObservationSidePanel adapter;
 * clicking a turn card shows the trace-level variant instead.
 */
export function ObservationInspector({
  projectId,
  sessionId,
  traces,
  filterState,
  openPeek,
}: {
  projectId: string;
  sessionId: string;
  traces: EventSessionTrace[];
  filterState: FilterState;
  openPeek: OpenPeek;
}) {
  const inspected = useSessionDetailStore(
    (state) => state.inspectedObservation,
  );
  const closeInspector = useSessionDetailStore(
    (state) => state.actions.closeInspector,
  );
  // Panel width, user-draggable via the left edge (clamped 320–720px and
  // to the viewport minus 100px, per the handoff).
  const asideRef = React.useRef<HTMLElement>(null);
  const [width, setWidth] = React.useState(436);
  const clampWidth = (candidate: number) =>
    Math.max(
      320,
      Math.min(
        720,
        Math.min(
          candidate,
          (typeof window !== "undefined" ? window.innerWidth : 1440) - 100,
        ),
      ),
    );
  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    // Pointer capture routes every move/up to the handle until release —
    // even when the pointer leaves the browser window mid-drag, so the
    // listeners can't leak on an off-window mouse release.
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    // The overlay is right-anchored, so its right edge stays put while the
    // width changes — measure once and drag against it.
    const rightEdge =
      asideRef.current?.getBoundingClientRect().right ?? window.innerWidth;
    const onMove = (moveEvent: PointerEvent) =>
      setWidth(clampWidth(rightEdge - moveEvent.clientX));
    const onEnd = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onEnd);
      handle.removeEventListener("pointercancel", onEnd);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onEnd);
    handle.addEventListener("pointercancel", onEnd);
  };

  const isOpen = inspected !== null;

  // Esc-to-close (window is the external system). Radix overlays (drawers,
  // dialogs, dropdowns) preventDefault when they handle Escape themselves, so
  // an already-handled Esc never also closes the inspector.
  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) closeInspector();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeInspector]);

  const observationsQuery =
    api.sessions.observationsForTraceFromEvents.useQuery(
      {
        projectId,
        sessionId,
        traceId: inspected?.traceId ?? "",
        filter: filterState,
      },
      {
        enabled: inspected !== null && inspected.observationId !== null,
        trpc: { context: { skipBatch: true } },
        staleTime: 60 * 1000,
      },
    );

  if (!inspected) return null;

  // Defensive against both response shapes (see TraceEventsRow, LFE-10958).
  type ObservationsResponse =
    RouterOutputs["sessions"]["observationsForTraceFromEvents"];
  const observationsData = observationsQuery.data as
    | ObservationsResponse
    | { observations?: ObservationsResponse }
    | undefined;
  const observations = Array.isArray(observationsData)
    ? observationsData
    : (observationsData?.observations ?? undefined);
  const observation = observations?.find(
    (candidate) => candidate.id === inspected.observationId,
  );
  const trace = traces.find((candidate) => candidate.id === inspected.traceId);

  // Eyebrow band content (handoff v3): `TYPE · timestamp`, both real data —
  // the timestamp is omitted while the observation is still loading.
  const bandType =
    inspected.observationId === null ? "trace" : (observation?.type ?? "span");
  const bandTimestamp =
    inspected.observationId === null
      ? (trace?.timestamp ?? null)
      : (observation?.startTime ?? null);

  return (
    <>
      {/* Transparent click-catcher — no scrim, clicking outside closes. */}
      <div
        aria-hidden
        className="absolute inset-0 z-10"
        onClick={closeInspector}
      />
      {/* Full-viewport-height sheet per the mock: fixed right, floating OVER
          the top bar and transcript. Rendered through the `panel` overlay
          layer (docked side surface — see ui/layer.tsx) so it escapes every
          in-app stacking context (sticky page header) by DOM order, without
          any z-index. Light = paper sheet on the white plane; dark = #1c1c19
          sheet with the deep drop shadow. */}
      <Layer name="panel">
        <aside
          ref={asideRef}
          aria-label="Observation details"
          style={{ width }}
          className="bg-background dark:bg-modal dark:border-border-contrast animate-in slide-in-from-right fixed inset-y-0 right-0 flex max-w-full flex-col border-l shadow-[-16px_0_40px_hsl(var(--foreground)/0.10)] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] dark:shadow-[-20px_0_48px_hsl(var(--surface-code)/0.5)]"
        >
          {/* Left-edge drag handle — resize the overlay (320–720px). */}
          <div
            onPointerDown={startResize}
            title="Drag to resize"
            className="hover:bg-muted-blue/30 absolute top-0 bottom-0 left-0 z-30 w-1.5 cursor-col-resize transition-colors duration-150"
          />
          {/* 40px eyebrow header band: `TYPE · timestamp` + close (Esc). */}
          <div className="border-border-contrast flex h-10 shrink-0 items-center justify-between gap-2 border-b border-dashed py-1 pr-2 pl-3.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-muted-foreground shrink-0 font-mono text-[10px] tracking-[0.05em] uppercase">
                {bandType}
              </span>
              {bandTimestamp ? (
                <>
                  <span className="bg-foreground-tertiary h-[3px] w-[3px] shrink-0 rounded-full" />
                  {/* LocalIsoDate sets its own title (UTC string), so the full
                  value stays available when the band clips it. */}
                  <LocalIsoDate
                    date={bandTimestamp}
                    accuracy="millisecond"
                    className="text-muted-foreground overflow-hidden font-mono text-[10px] text-ellipsis whitespace-nowrap"
                  />
                </>
              ) : null}
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Close inspector"
              title="Close (Esc)"
              onClick={closeInspector}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          {inspected.observationId === null && trace ? (
            <TraceInspectorContent
              key={trace.id}
              trace={trace}
              projectId={projectId}
              sessionId={sessionId}
              openPeek={openPeek}
            />
          ) : observationsQuery.isLoading ? (
            <div className="p-4">
              <JsonSkeleton className="h-full w-full" numRows={10} />
            </div>
          ) : observation ? (
            <SessionObservationSidePanel
              key={observation.id}
              observation={observation}
              trace={trace}
              projectId={projectId}
              onOpenTraceView={
                trace
                  ? () =>
                      openPeek(trace.id, {
                        ...trace,
                        observationId: observation.id,
                      })
                  : undefined
              }
            />
          ) : (
            <div className="flex flex-col gap-3 p-4">
              <span className="text-sm font-bold">Observation</span>
              <p className="text-muted-foreground text-xs">
                This observation is not part of the current view. It may be
                hidden by the active filter.
              </p>
              {trace ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    openPeek(trace.id, {
                      ...trace,
                      observationId: inspected.observationId,
                    })
                  }
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                  Open Trace View
                </Button>
              ) : null}
            </div>
          )}
        </aside>
      </Layer>
    </>
  );
}
