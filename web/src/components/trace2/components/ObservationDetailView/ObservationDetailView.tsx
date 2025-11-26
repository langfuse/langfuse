/**
 * ObservationDetailView - Shows observation-level details when an observation is selected
 *
 * Responsibility:
 * - Display observation metadata (type, timestamp, model, environment, etc.)
 * - Show cost and token usage with tooltips
 * - Provide tabbed interface (Preview, Scores)
 * - Support Formatted/JSON toggle for preview content
 *
 * Hooks:
 * - useLocalStorage() - for JSON view preference
 * - useState() - for tab selection
 *
 * Re-renders when:
 * - Observation prop changes (new observation selected)
 * - Tab selection changes
 * - View mode toggle changes
 */

import { type ObservationType } from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { Badge } from "@/src/components/ui/badge";
import { ItemBadge } from "@/src/components/ItemBadge";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import useLocalStorage from "@/src/components/useLocalStorage";
import { useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

export interface ObservationDetailViewProps {
  observation: ObservationReturnTypeWithMetadata;
  projectId: string;
}

export function ObservationDetailView({
  observation,
  projectId: _projectId,
}: ObservationDetailViewProps) {
  const [selectedTab, setSelectedTab] = useState<"preview" | "scores">(
    "preview",
  );
  const [currentView, setCurrentView] = useLocalStorage<"pretty" | "json">(
    "jsonViewPreference",
    "pretty",
  );

  // Calculate latency if not provided
  const latency =
    observation.latency ??
    (observation.startTime && observation.endTime
      ? observation.endTime.getTime() - observation.startTime.getTime()
      : null);

  // Format cost and usage values
  const totalCost = observation.totalCost;
  const inputCost = observation.inputCost;
  const outputCost = observation.outputCost;
  const totalUsage = observation.totalUsage;
  const inputUsage = observation.inputUsage;
  const outputUsage = observation.outputUsage;

  const hasCostData = totalCost !== null && totalCost !== undefined;
  const hasUsageData = totalUsage > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header section */}
      <div className="flex-shrink-0 space-y-2 border-b p-4">
        {/* Title row */}
        <div className="flex items-start gap-2">
          <div className="mt-1">
            <ItemBadge type={observation.type as ObservationType} isSmall />
          </div>
          <span className="min-w-0 break-all font-medium">
            {observation.name || observation.id}
          </span>
        </div>

        {/* Metadata badges - all on one row like traces/ */}
        <div className="flex flex-wrap items-center gap-1">
          <LocalIsoDate
            date={observation.startTime}
            accuracy="millisecond"
            className="text-sm"
          />
          {latency !== null && latency !== undefined && (
            <Badge variant="tertiary">
              Latency: {(latency / 1000).toFixed(2)}s
            </Badge>
          )}
          {observation.environment && (
            <Badge variant="tertiary">Env: {observation.environment}</Badge>
          )}
          {hasCostData && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="tertiary">
                    Cost: ${totalCost.toFixed(6)}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1 text-xs">
                    {inputCost !== null && inputCost !== undefined && (
                      <div>Input: ${inputCost.toFixed(6)}</div>
                    )}
                    {outputCost !== null && outputCost !== undefined && (
                      <div>Output: ${outputCost.toFixed(6)}</div>
                    )}
                    <div className="font-semibold">
                      Total: ${totalCost.toFixed(6)}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {hasUsageData && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="tertiary">
                    Tokens: {totalUsage.toLocaleString()}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-1 text-xs">
                    <div>Input: {inputUsage.toLocaleString()}</div>
                    <div>Output: {outputUsage.toLocaleString()}</div>
                    <div className="font-semibold">
                      Total: {totalUsage.toLocaleString()}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {observation.version && (
            <Badge variant="tertiary">Version: {observation.version}</Badge>
          )}
          {observation.model && (
            <Badge variant="tertiary">{observation.model}</Badge>
          )}
          {observation.level && observation.level !== "DEFAULT" && (
            <Badge
              variant={
                observation.level === "ERROR"
                  ? "destructive"
                  : observation.level === "WARNING"
                    ? "warning"
                    : "tertiary"
              }
            >
              {observation.level}
            </Badge>
          )}
          {observation.statusMessage && (
            <Badge variant="tertiary">{observation.statusMessage}</Badge>
          )}
        </div>
      </div>

      {/* Tabs section */}
      <TabsBar
        value={selectedTab}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        onValueChange={(value) => setSelectedTab(value as "preview" | "scores")}
      >
        <TabsBarList>
          <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
          <TabsBarTrigger value="scores">Scores</TabsBarTrigger>

          {/* View toggle (Formatted/JSON) - show for preview tab */}
          {selectedTab === "preview" && (
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
              Preview tab content (S5.1)
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
              Scores tab content (S5.5)
            </p>
          </div>
        </TabsBarContent>
      </TabsBar>
    </div>
  );
}
