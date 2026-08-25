import { useState, type ComponentProps, type Key, type ReactNode } from "react";

import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { IOPreview } from "@/src/features/traces/components/IOPreview/IOPreview";
import { TRACE_VIEW_CONFIG } from "@/src/features/traces/constants/traceViewConfig";
import TagList from "@/src/features/tag/components/TagList";

type SelectedTab = "preview" | "log" | "scores";

export interface ObservationDetailViewProps {
  header: ReactNode;
  selectedTab: SelectedTab;
  onSelectedTabChange: (tab: SelectedTab) => void;
  currentView: ComponentProps<typeof IOPreview>["currentView"];
  jsonBetaEnabled: boolean;
  onViewTabChange: (tab: string) => void;
  onBetaToggle: (enabled: boolean) => void;
  tags?: string[] | null;
  previewKey: Key;
  previewProps: Omit<
    ComponentProps<typeof IOPreview>,
    "currentView" | "setIsPrettyViewAvailable" | "onVirtualizationChange"
  >;
  scoresTab?: ReactNode;
  logTab?: {
    observationCount: number;
    content: ReactNode;
  };
  showTabsBar: boolean;
}

export function ObservationDetailView({
  header,
  selectedTab,
  onSelectedTabChange,
  currentView,
  jsonBetaEnabled,
  onViewTabChange,
  onBetaToggle,
  tags,
  previewKey,
  previewProps,
  scoresTab,
  logTab,
  showTabsBar,
}: ObservationDetailViewProps) {
  const [isPrettyViewAvailable, setIsPrettyViewAvailable] = useState(true);
  const [isJSONBetaVirtualized, setIsJSONBetaVirtualized] = useState(false);
  const isLogViewVirtualized =
    (logTab?.observationCount ?? 0) >=
    TRACE_VIEW_CONFIG.logView.virtualizationThreshold;
  const selectedViewTab = currentView === "pretty" ? "pretty" : "json";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {header}

      <TabsBar
        value={selectedTab}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        onValueChange={(value) => onSelectedTabChange(value as SelectedTab)}
      >
        {showTabsBar && (
          <TooltipProvider>
            <TabsBarList>
              <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
              {scoresTab ? (
                <TabsBarTrigger value="scores">Scores</TabsBarTrigger>
              ) : null}
              {logTab ? (
                <TabsBarTrigger value="log">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>Log View</span>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      {isLogViewVirtualized
                        ? `Shows all ${logTab.observationCount} observations with virtualization enabled.`
                        : "Shows all observations concatenated. Great for quickly scanning through them."}
                    </TooltipContent>
                  </Tooltip>
                </TabsBarTrigger>
              ) : null}

              {(selectedTab === "log" ||
                (selectedTab === "preview" && isPrettyViewAvailable)) && (
                <>
                  <Tabs
                    className="ml-auto h-fit px-2 py-0.5"
                    value={
                      selectedTab === "log" && isLogViewVirtualized
                        ? "pretty"
                        : selectedViewTab
                    }
                    onValueChange={(value) => {
                      if (
                        selectedTab === "log" &&
                        isLogViewVirtualized &&
                        value === "json"
                      ) {
                        return;
                      }
                      onViewTabChange(value);
                    }}
                  >
                    <TabsList className="h-fit py-0.5">
                      <TabsTrigger
                        value="pretty"
                        className="h-fit px-1 text-xs"
                      >
                        Formatted
                      </TabsTrigger>
                      {selectedTab === "log" && isLogViewVirtualized ? (
                        <HoverCard openDelay={200}>
                          <HoverCardTrigger asChild>
                            <span>
                              <TabsTrigger
                                value="json"
                                className="h-fit px-1 text-xs"
                                disabled
                              >
                                JSON
                              </TabsTrigger>
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent
                            align="end"
                            className="w-64 text-sm"
                            sideOffset={8}
                          >
                            <p className="font-bold">JSON view unavailable</p>
                            <p className="text-muted-foreground mt-1">
                              Disabled for traces with{" "}
                              {
                                TRACE_VIEW_CONFIG.logView
                                  .virtualizationThreshold
                              }
                              + observations to maintain performance.
                            </p>
                          </HoverCardContent>
                        </HoverCard>
                      ) : (
                        <TabsTrigger
                          value="json"
                          className="h-fit px-1 text-xs"
                        >
                          JSON
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </Tabs>
                  {selectedViewTab === "json" &&
                    !(selectedTab === "log" && isLogViewVirtualized) && (
                      <div className="mr-1 flex items-center gap-1.5">
                        <Switch
                          size="sm"
                          checked={jsonBetaEnabled}
                          onCheckedChange={onBetaToggle}
                        />
                        <span className="text-muted-foreground text-xs">
                          Beta
                        </span>
                      </div>
                    )}
                </>
              )}
            </TabsBarList>
          </TooltipProvider>
        )}

        <TabsBarContent
          value="preview"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <div
            className={`flex min-h-0 w-full flex-1 flex-col ${
              currentView === "json-beta" && isJSONBetaVirtualized
                ? "overflow-hidden"
                : "overflow-auto pb-4"
            }`}
          >
            {tags && tags.length > 0 ? (
              <>
                <div
                  className={`px-2 pt-2 text-sm font-bold ${currentView !== "pretty" ? "shrink-0" : ""}`}
                >
                  Tags
                </div>
                <div
                  className={`flex flex-wrap gap-x-1 gap-y-1 px-2 pb-2 ${currentView !== "pretty" ? "shrink-0" : ""}`}
                >
                  <TagList selectedTags={tags} isLoading={false} />
                </div>
              </>
            ) : null}
            <IOPreview
              key={previewKey}
              {...previewProps}
              currentView={currentView}
              setIsPrettyViewAvailable={setIsPrettyViewAvailable}
              onVirtualizationChange={setIsJSONBetaVirtualized}
            />
            {currentView !== "json-beta" ? (
              <div className="h-4 w-full shrink-0" />
            ) : null}
          </div>
        </TabsBarContent>

        {scoresTab ? (
          <TabsBarContent
            value="scores"
            className="mt-0 mr-4 mb-2 flex h-full min-h-0 flex-1 overflow-hidden"
          >
            <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
              {scoresTab}
            </div>
          </TabsBarContent>
        ) : null}

        {logTab ? (
          <TabsBarContent
            value="log"
            className="mt-0 flex max-h-full min-h-0 w-full flex-1"
          >
            {logTab.content}
          </TabsBarContent>
        ) : null}
      </TabsBar>
    </div>
  );
}
