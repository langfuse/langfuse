/**
 * TraceDetailView - Shows trace-level details when no observation is selected
 *
 * Features:
 * - Header with badge and trace name
 * - Metadata badges (timestamp, session, user, environment, latency, cost)
 * - Tabs: Preview (I/O, tags, metadata), Log, Scores
 * - View toggle (Formatted/JSON)
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
import { useState } from "react";

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
        onValueChange={(value) => setSelectedTab(value as typeof selectedTab)}
      >
        <TabsBarList>
          <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
          {observations.length > 0 && (
            <TabsBarTrigger value="log">Log View</TabsBarTrigger>
          )}
          <TabsBarTrigger value="scores">Scores</TabsBarTrigger>
        </TabsBarList>

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

        {/* Log tab content */}
        <TabsBarContent
          value="log"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <div className="w-full overflow-y-auto p-4">
            <p className="text-sm text-muted-foreground">
              Log view content (TODO: Add TraceLogView)
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {observations.length} observations
            </p>
          </div>
        </TabsBarContent>

        {/* Scores tab content */}
        <TabsBarContent
          value="scores"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <div className="w-full overflow-y-auto p-4">
            <p className="text-sm text-muted-foreground">
              Scores content (TODO: Add ScoresTable)
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {scores.length} scores
            </p>
          </div>
        </TabsBarContent>
      </TabsBar>
    </div>
  );
}
