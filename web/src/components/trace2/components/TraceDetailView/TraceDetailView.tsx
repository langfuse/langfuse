/**
 * TraceDetailView - Shows trace-level details when no observation is selected
 */

import {
  type TraceDomain,
  type ScoreDomain,
  AnnotationQueueObjectType,
} from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { Badge } from "@/src/components/ui/badge";
import { ItemBadge } from "@/src/components/ItemBadge";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
// Preview tab components
import { IOPreview } from "@/src/components/trace2/components/IOPreview/IOPreview";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import TagList from "@/src/features/tag/components/TagList";
import { useJsonExpansion } from "@/src/components/trace2/contexts/JsonExpansionContext";
import { useMedia } from "@/src/components/trace2/api/useMedia";

// Header action components
import { CopyIdsPopover } from "@/src/components/trace2/components/_shared/CopyIdsPopover";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { useTraceData } from "@/src/components/trace2/contexts/TraceDataContext";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { TraceLogView } from "@/src/components/trace2/components/TraceDetailView/TraceLogView";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";

const LOG_VIEW_CONFIRMATION_THRESHOLD = 150;
const LOG_VIEW_DISABLED_THRESHOLD = 350;

export interface TraceDetailViewProps {
  trace: Omit<WithStringifiedMetadata<TraceDomain>, "input" | "output"> & {
    latency?: number;
    input: string | null;
    output: string | null;
  };
  observations: ObservationReturnTypeWithMetadata[];
  scores: WithStringifiedMetadata<ScoreDomain>[];
  projectId: string;
}

export function TraceDetailView({
  trace,
  observations,
  scores,
  projectId,
}: TraceDetailViewProps) {
  const [selectedTab, setSelectedTab] = useState<"preview" | "log" | "scores">(
    "preview",
  );
  const [currentView, setCurrentView] = useLocalStorage<"pretty" | "json">(
    "jsonViewPreference",
    "pretty",
  );
  const [isPrettyViewAvailable, setIsPrettyViewAvailable] = useState(true);

  // Get comments and expansion state from contexts
  const { comments } = useTraceData();
  const { expansionState, setFieldExpansion } = useJsonExpansion();

  // Fetch media for trace-level I/O
  const traceMedia = useMedia({ projectId, traceId: trace.id });

  // Filter scores for trace-level only (no observationId)
  const traceScores = useMemo(
    () => scores.filter((s) => !s.observationId),
    [scores],
  );

  const showLogViewTab = observations.length > 0;

  // Log view thresholds for performance
  const isLogViewDisabled = observations.length > LOG_VIEW_DISABLED_THRESHOLD;
  const requiresConfirmation =
    observations.length > LOG_VIEW_CONFIRMATION_THRESHOLD && !isLogViewDisabled;

  const [hasLogViewConfirmed, setHasLogViewConfirmed] = useState(false);
  const [showLogViewDialog, setShowLogViewDialog] = useState(false);

  // Reset confirmation on trace change
  useEffect(() => {
    setHasLogViewConfirmed(false);
  }, [trace.id]);

  // Auto-redirect from invalid tab state
  useEffect(() => {
    if ((isLogViewDisabled || !showLogViewTab) && selectedTab === "log") {
      setSelectedTab("preview");
    }
  }, [isLogViewDisabled, showLogViewTab, selectedTab]);

  // Scores tab visibility: hide for public trace viewers and in peek mode (annotation queues)
  const router = useRouter();
  const { peek } = router.query;
  const isAuthenticatedAndProjectMember =
    useIsAuthenticatedAndProjectMember(projectId);
  const showScoresTab = isAuthenticatedAndProjectMember && peek === undefined;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header section */}
      <div className="flex-shrink-0 space-y-2 border-b p-4">
        {/* Title row with actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <div className="mt-1">
              <ItemBadge type="TRACE" isSmall />
            </div>
            <span className="min-w-0 break-all font-medium">
              {trace.name || trace.id}
            </span>
            <CopyIdsPopover idItems={[{ id: trace.id, name: "Trace ID" }]} />
          </div>
          {/* Action buttons */}
          <div className="flex flex-shrink-0 flex-wrap items-start gap-0.5">
            <NewDatasetItemFromExistingObject
              traceId={trace.id}
              projectId={projectId}
              input={trace.input}
              output={trace.output}
              metadata={trace.metadata}
              key={trace.id}
              size="sm"
            />
            <div className="flex items-start">
              <AnnotateDrawer
                key={"annotation-drawer-" + trace.id}
                projectId={projectId}
                scoreTarget={{
                  type: "trace",
                  traceId: trace.id,
                }}
                scores={traceScores}
                scoreMetadata={{
                  projectId: projectId,
                  environment: trace.environment,
                }}
                size="sm"
              />
              <CreateNewAnnotationQueueItem
                projectId={projectId}
                objectId={trace.id}
                objectType={AnnotationQueueObjectType.TRACE}
                size="sm"
              />
            </div>
            <CommentDrawerButton
              projectId={projectId}
              objectId={trace.id}
              objectType="TRACE"
              count={comments.get(trace.id)}
              size="sm"
            />
          </div>
        </div>

        {/* Metadata badges */}
        <div className="flex flex-col gap-2">
          {/* Timestamp */}
          <div className="flex flex-wrap items-center gap-1">
            <LocalIsoDate
              date={trace.timestamp}
              accuracy="millisecond"
              className="text-sm"
            />
          </div>

          {/* Other badges */}
          <div className="flex flex-wrap items-center gap-1">
            {trace.sessionId && (
              <Link
                href={`/project/${projectId}/sessions/${encodeURIComponent(trace.sessionId)}`}
                className="inline-flex"
              >
                <Badge>
                  <span className="truncate">Session: {trace.sessionId}</span>
                  <ExternalLinkIcon className="ml-1 h-3 w-3" />
                </Badge>
              </Link>
            )}
            {trace.userId && (
              <Link
                href={`/project/${projectId}/users/${encodeURIComponent(trace.userId)}`}
                className="inline-flex"
              >
                <Badge>
                  <span className="truncate">User ID: {trace.userId}</span>
                  <ExternalLinkIcon className="ml-1 h-3 w-3" />
                </Badge>
              </Link>
            )}
            {trace.environment && (
              <Badge variant="tertiary">Env: {trace.environment}</Badge>
            )}
            {trace.release && (
              <Badge variant="tertiary">Release: {trace.release}</Badge>
            )}
            {trace.version && (
              <Badge variant="tertiary">Version: {trace.version}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Tabs section */}
      <TabsBar
        value={selectedTab}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        onValueChange={(value) => {
          // Show confirmation dialog for log view if needed
          if (value === "log" && requiresConfirmation && !hasLogViewConfirmed) {
            setShowLogViewDialog(true);
            return;
          }
          setSelectedTab(value as "preview" | "log" | "scores");
        }}
      >
        <TooltipProvider>
          <TabsBarList>
            <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
            {showLogViewTab && (
              <TabsBarTrigger value="log" disabled={isLogViewDisabled}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>Log View</span>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    {isLogViewDisabled
                      ? `Log View is disabled for traces with more than ${LOG_VIEW_DISABLED_THRESHOLD} observations (this trace has ${observations.length})`
                      : requiresConfirmation
                        ? `Log View may be slow with ${observations.length} observations. Click to confirm.`
                        : "Shows all observations concatenated. Great for quickly scanning through them. Nullish values are omitted."}
                  </TooltipContent>
                </Tooltip>
              </TabsBarTrigger>
            )}
            {showScoresTab && (
              <TabsBarTrigger value="scores">Scores</TabsBarTrigger>
            )}

            {/* View toggle (Formatted/JSON) - show for preview and log tabs when pretty view available */}
            {(selectedTab === "log" ||
              (selectedTab === "preview" && isPrettyViewAvailable)) && (
              <Tabs
                className="ml-auto mr-1 h-fit px-2 py-0.5"
                value={currentView}
                onValueChange={(value) => {
                  setCurrentView(value as "pretty" | "json");
                }}
              >
                <TabsList className="h-fit py-0.5">
                  <TabsTrigger value="pretty" className="h-fit px-1 text-xs">
                    Formatted
                  </TabsTrigger>
                  <TabsTrigger value="json" className="h-fit px-1 text-xs">
                    JSON
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </TabsBarList>
        </TooltipProvider>

        {/* Preview tab content */}
        <TabsBarContent
          value="preview"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <div className="flex w-full flex-col gap-2 overflow-y-auto p-4">
            {/* I/O Preview */}
            <IOPreview
              key={trace.id + "-io"}
              input={trace.input ?? undefined}
              output={trace.output ?? undefined}
              media={traceMedia.data}
              currentView={currentView}
              setIsPrettyViewAvailable={setIsPrettyViewAvailable}
              inputExpansionState={expansionState.input}
              outputExpansionState={expansionState.output}
              onInputExpansionChange={(exp) => setFieldExpansion("input", exp)}
              onOutputExpansionChange={(exp) =>
                setFieldExpansion("output", exp)
              }
            />

            {/* Tags Section */}
            <div className="px-2 text-sm font-medium">Tags</div>
            <div className="flex flex-wrap gap-x-1 gap-y-1 px-2">
              <TagList selectedTags={trace.tags} isLoading={false} />
            </div>

            {/* Metadata Section */}
            {trace.metadata && (
              <div className="px-2">
                <PrettyJsonView
                  key={trace.id + "-metadata"}
                  title="Metadata"
                  json={trace.metadata}
                  media={traceMedia.data?.filter((m) => m.field === "metadata")}
                  currentView={currentView}
                  externalExpansionState={expansionState.metadata}
                  onExternalExpansionChange={(exp) =>
                    setFieldExpansion("metadata", exp)
                  }
                />
              </div>
            )}
          </div>
        </TabsBarContent>

        {/* Log View tab content */}
        <TabsBarContent
          value="log"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <TraceLogView
            observations={observations}
            traceId={trace.id}
            projectId={projectId}
            currentView={currentView}
            trace={trace}
          />
        </TabsBarContent>

        {/* Scores tab content */}
        {showScoresTab && (
          <TabsBarContent
            value="scores"
            className="mt-0 flex max-h-full min-h-0 w-full flex-1 overflow-hidden"
          >
            <div className="flex h-full min-h-0 w-full flex-col overflow-hidden pr-3">
              <ScoresTable
                projectId={projectId}
                omittedFilter={["Trace ID"]}
                traceId={trace.id}
                hiddenColumns={["traceName", "jobConfigurationId", "userId"]}
                localStorageSuffix="TracePreview"
              />
            </div>
          </TabsBarContent>
        )}
      </TabsBar>

      {/* Confirmation dialog for log view with many observations */}
      <AlertDialog open={showLogViewDialog} onOpenChange={setShowLogViewDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sluggish Performance Warning</AlertDialogTitle>
            <AlertDialogDescription>
              This trace has {observations.length} observations. The log view
              may be slow to load and interact with. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowLogViewDialog(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setHasLogViewConfirmed(true);
                setShowLogViewDialog(false);
                setSelectedTab("log");
              }}
            >
              Show Log View
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
