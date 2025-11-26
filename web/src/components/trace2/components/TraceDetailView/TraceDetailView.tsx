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
import { useMemo, useState } from "react";

// Header action components
import { CopyIdsPopover } from "@/src/components/trace2/components/_shared/CopyIdsPopover";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { useTraceData } from "@/src/components/trace2/contexts/TraceDataContext";

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

  // Get comments from context
  const { comments } = useTraceData();

  // Filter scores for trace-level only (no observationId)
  const traceScores = useMemo(
    () => scores.filter((s) => !s.observationId),
    [scores],
  );

  const showLogViewTab = observations.length > 0;

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
        onValueChange={(value) =>
          setSelectedTab(value as "preview" | "log" | "scores")
        }
      >
        <TabsBarList>
          <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
          {showLogViewTab && (
            <TabsBarTrigger value="log">Log View</TabsBarTrigger>
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

        {/* Preview tab content - placeholder */}
        <TabsBarContent
          value="preview"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <div className="flex h-full w-full items-center justify-center p-4">
            <p className="text-sm text-muted-foreground">
              Preview tab content (S5.4a)
            </p>
          </div>
        </TabsBarContent>

        {/* Log View tab content - placeholder */}
        <TabsBarContent
          value="log"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <div className="flex h-full w-full items-center justify-center p-4">
            <p className="text-sm text-muted-foreground">
              Log View tab content (S5.4b)
            </p>
          </div>
        </TabsBarContent>

        {/* Scores tab content - placeholder */}
        <TabsBarContent
          value="scores"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <div className="flex h-full w-full items-center justify-center p-4">
            <p className="text-sm text-muted-foreground">
              Scores tab content (S5.4c)
            </p>
          </div>
        </TabsBarContent>
      </TabsBar>
    </div>
  );
}
