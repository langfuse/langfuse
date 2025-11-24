/**
 * TraceSettingsDropdown - View preferences dropdown component
 *
 * Provides toggles for:
 * - Show Comments
 * - Show Scores
 * - Show Duration
 * - Show Cost/Tokens
 * - Color Code Metrics (dependent on duration or cost being enabled)
 * - Minimum Observation Level filter
 * - Show Graph (hidden when graph view not available)
 *
 * All preferences are managed via ViewPreferencesContext and persisted to localStorage.
 */

import { type ObservationLevelType, ObservationLevel } from "@langfuse/shared";
import { Settings2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/src/components/ui/dropdown-menu";
import { Switch } from "@/src/components/ui/switch";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useViewPreferences } from "../contexts/ViewPreferencesContext";

export interface TraceSettingsDropdownProps {
  isGraphViewAvailable: boolean;
}

export function TraceSettingsDropdown({
  isGraphViewAvailable,
}: TraceSettingsDropdownProps) {
  const capture = usePostHogClientCapture();

  // Get all preferences directly from context
  const {
    showGraph,
    setShowGraph,
    showComments,
    setShowComments,
    showScores,
    setShowScores,
    showDuration,
    setShowDuration,
    showCostTokens,
    setShowCostTokens,
    colorCodeMetrics,
    setColorCodeMetrics,
    minObservationLevel,
    setMinObservationLevel,
  } = useViewPreferences();

  // Color coding is only available when duration or cost metrics are shown
  const isColorCodeEnabled = showDuration || showCostTokens;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          title="View Options"
          className="h-7 w-7"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>View Options</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Show Graph Toggle (only when available) */}
        {isGraphViewAvailable && (
          <div className="p-1">
            <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
              <div className="flex w-full items-center justify-between">
                <span className="mr-2">Show Graph</span>
                <Switch checked={showGraph} onCheckedChange={setShowGraph} />
              </div>
            </DropdownMenuItem>
          </div>
        )}

        <div className="space-y-1 p-1">
          {/* Show Comments Toggle */}
          <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
            <div className="flex w-full items-center justify-between">
              <span className="mr-2">Show Comments</span>
              <Switch
                checked={showComments}
                onCheckedChange={setShowComments}
              />
            </div>
          </DropdownMenuItem>

          {/* Show Scores Toggle */}
          <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
            <div className="flex w-full items-center justify-between">
              <span className="mr-2">Show Scores</span>
              <Switch
                checked={showScores}
                onCheckedChange={(checked) => {
                  capture("trace_detail:observation_tree_toggle_scores", {
                    show: checked,
                  });
                  setShowScores(checked);
                }}
              />
            </div>
          </DropdownMenuItem>

          {/* Show Duration Toggle */}
          <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
            <div className="flex w-full items-center justify-between">
              <span className="mr-2">Show Duration</span>
              <Switch
                checked={showDuration}
                onCheckedChange={setShowDuration}
              />
            </div>
          </DropdownMenuItem>

          {/* Show Cost/Tokens Toggle */}
          <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
            <div className="flex w-full items-center justify-between">
              <span className="mr-2">Show Cost/Tokens</span>
              <Switch
                checked={showCostTokens}
                onCheckedChange={setShowCostTokens}
              />
            </div>
          </DropdownMenuItem>

          {/* Color Code Metrics Toggle (disabled when no metrics shown) */}
          <DropdownMenuItem
            asChild
            onSelect={(e) => e.preventDefault()}
            disabled={!isColorCodeEnabled}
            className={cn(!isColorCodeEnabled && "cursor-not-allowed")}
          >
            <div
              className={cn(
                "flex w-full items-center justify-between",
                !isColorCodeEnabled && "cursor-not-allowed",
              )}
            >
              <span
                className={cn(
                  "mr-2",
                  !isColorCodeEnabled && "cursor-not-allowed",
                )}
              >
                Color Code Metrics
              </span>
              <Switch
                checked={colorCodeMetrics}
                onCheckedChange={setColorCodeMetrics}
                disabled={!isColorCodeEnabled}
                className={cn(!isColorCodeEnabled && "cursor-not-allowed")}
              />
            </div>
          </DropdownMenuItem>
        </div>

        {/* Minimum Observation Level Submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="flex items-center">
              Min Level: {minObservationLevel}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel className="font-semibold">
              Minimum Level
            </DropdownMenuLabel>
            {Object.values(ObservationLevel).map((level) => (
              <DropdownMenuItem
                key={level}
                onSelect={(e) => {
                  e.preventDefault();
                  setMinObservationLevel(level);
                }}
              >
                {level}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
