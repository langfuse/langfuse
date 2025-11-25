/**
 * TraceDetailView - Shows trace-level details when no observation is selected
 *
 * Features:
 * - Header with badge and trace name
 * - Metadata badges (timestamp, session, user, environment, latency, cost)
 * - Tabs: Preview (I/O, tags, metadata), Log, Scores
 * - View toggle (Formatted/JSON)
 * - Log view thresholds matching trace/ TracePreview behavior
 */

import { type TraceDomain, type ScoreDomain } from "@langfuse/shared";
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
import ScoresTable from "@/src/components/table/use-cases/scores";
import { TraceLogView } from "./TraceLogView";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useState, useEffect } from "react";
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

// Match thresholds from trace/ TracePreview
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
  scores: _scores,
  projectId,
}: TraceDetailViewProps) {
  const [selectedTab, setSelectedTab] = useState<"preview" | "log" | "scores">(
    "preview",
  );
  const [currentView, setCurrentView] = useLocalStorage<"pretty" | "json">(
    "jsonViewPreference",
    "pretty",
  );

  // Log view thresholds - match trace/ TracePreview behavior
  const isLogViewDisabled = observations.length > LOG_VIEW_DISABLED_THRESHOLD;
  const requiresConfirmation =
    observations.length > LOG_VIEW_CONFIRMATION_THRESHOLD && !isLogViewDisabled;
  const showLogViewTab = observations.length > 0;

  const [hasLogViewConfirmed, setHasLogViewConfirmed] = useState(false);
  const [showLogViewDialog, setShowLogViewDialog] = useState(false);

  // Reset confirmation when trace changes
  useEffect(() => {
    setHasLogViewConfirmed(false);
  }, [trace.id]);

  // Redirect from log tab if it becomes disabled
  useEffect(() => {
    if ((isLogViewDisabled || !showLogViewTab) && selectedTab === "log") {
      setSelectedTab("preview");
    }
  }, [isLogViewDisabled, showLogViewTab, selectedTab]);

  const handleConfirmLogView = () => {
    setHasLogViewConfirmed(true);
    setShowLogViewDialog(false);
    setSelectedTab("log");
  };

  const handleTabChange = (value: string) => {
    // Check if confirmation is needed for log view
    if (value === "log" && requiresConfirmation && !hasLogViewConfirmed) {
      setShowLogViewDialog(true);
      return;
    }
    setSelectedTab(value as typeof selectedTab);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header section */}
      <div className="flex-shrink-0 space-y-2 border-b p-4">
        {/* Title row */}
        <div className="flex items-start gap-2">
          <div className="mt-1">
            <ItemBadge type="TRACE" isSmall />
          </div>
          <span className="min-w-0 break-all font-medium">
            {trace.name || trace.id}
          </span>
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
        onValueChange={handleTabChange}
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
            <TabsBarTrigger value="scores">Scores</TabsBarTrigger>

            {/* View toggle (Formatted/JSON) - show for preview and log tabs */}
            {(selectedTab === "log" || selectedTab === "preview") && (
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
          <div className="w-full overflow-y-auto p-4">
            <p className="text-sm text-muted-foreground">
              Preview content (TODO: Add IOPreview, Tags, Metadata)
            </p>
            <pre className="mt-2 text-xs">
              {JSON.stringify(
                { input: trace.input, output: trace.output },
                null,
                2,
              )}
            </pre>
          </div>
        </TabsBarContent>

        {/* Log tab content - only mount when active to avoid fetching all observations upfront */}
        <TabsBarContent value="log">
          {selectedTab === "log" && (
            <TraceLogView
              observations={observations}
              traceId={trace.id}
              projectId={projectId}
              currentView={currentView}
              trace={trace}
            />
          )}
        </TabsBarContent>

        {/* Scores tab content */}
        <TabsBarContent
          value="scores"
          className="mb-2 mr-4 mt-0 flex h-full min-h-0 w-full overflow-hidden md:flex-1"
        >
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden pr-3 md:flex-1">
            <ScoresTable
              projectId={projectId}
              omittedFilter={["Trace ID"]}
              traceId={trace.id}
              hiddenColumns={["traceName", "jobConfigurationId", "userId"]}
              localStorageSuffix="TracePreview"
            />
          </div>
        </TabsBarContent>
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
            <AlertDialogAction onClick={handleConfirmLogView}>
              Show Log View
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
