/**
 * TraceSettingsDropdown - View preferences dropdown component
 *
 * Provides toggles for:
 * - Show Comments
 * - Show Scores
 * - Show Duration
 * - Show Cost/Tokens
 * - Color Code Metrics (dependent on duration or cost being enabled)
 * - Collapse System Prompts
 * - Minimum Observation Level filter
 * - Show Graph (hidden when graph view not available)
 *
 * All preferences are managed via ViewPreferencesContext and persisted to localStorage.
 */

import { ObservationLevel } from "@langfuse/shared";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
} from "@/src/components/ui/dropdown-menu";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { useTraceAnalyticsDimensions } from "@/src/features/traces/hooks/useTraceAnalyticsDimensions";

/**
 * The view-option menu items (toggles + min-level submenu) without the
 * dropdown shell, so they can be reused inside the navigation header's overflow
 * "⋯" menu when the panel is too narrow for inline toolbar icons.
 */
export function TraceViewOptionsMenuItems() {
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();

  // Get all preferences directly from context
  const {
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
    collapseSystemPrompt,
    setCollapseSystemPrompt,
  } = useViewPreferences();

  // Color coding is only available when duration or cost metrics are shown
  const isColorCodeEnabled = showDuration || showCostTokens;

  return (
    <>
      <div className="space-y-0 p-0 py-1">
        {/* Graph is a view on the Tree/Timeline/Graph switch now — no
            visibility toggle. */}
        {/* Show Comments Toggle */}
        <DropdownMenuItem
          asChild
          onSelect={(e) => e.preventDefault()}
          className="px-2 py-1"
        >
          <div className="flex w-full items-center justify-between">
            <span className="mr-2">Show Comments</span>
            <Switch
              size="sm"
              checked={showComments}
              onCheckedChange={setShowComments}
            />
          </div>
        </DropdownMenuItem>

        {/* Show Scores Toggle */}
        <DropdownMenuItem
          asChild
          onSelect={(e) => e.preventDefault()}
          className="px-2 py-1"
        >
          <div className="flex w-full items-center justify-between">
            <span className="mr-2">Show Scores</span>
            <Switch
              size="sm"
              checked={showScores}
              onCheckedChange={(checked) => {
                capture("trace_detail:observation_tree_toggle_scores", {
                  show: checked,
                  ...analyticsDimensions,
                });
                setShowScores(checked);
              }}
            />
          </div>
        </DropdownMenuItem>

        {/* Show Duration Toggle */}
        <DropdownMenuItem
          asChild
          onSelect={(e) => e.preventDefault()}
          className="px-2 py-1"
        >
          <div className="flex w-full items-center justify-between">
            <span className="mr-2">Show Duration</span>
            <Switch
              size="sm"
              checked={showDuration}
              onCheckedChange={setShowDuration}
            />
          </div>
        </DropdownMenuItem>

        {/* Show Cost/Tokens Toggle */}
        <DropdownMenuItem
          asChild
          onSelect={(e) => e.preventDefault()}
          className="px-2 py-1"
        >
          <div className="flex w-full items-center justify-between">
            <span className="mr-2">Show Cost/Tokens</span>
            <Switch
              size="sm"
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
          className={cn([
            "px-2 py-1",
            isColorCodeEnabled ? "" : "cursor-not-allowed",
          ])}
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
              Show Color Code Metrics
            </span>
            <Switch
              size="sm"
              checked={colorCodeMetrics}
              onCheckedChange={setColorCodeMetrics}
              disabled={!isColorCodeEnabled}
            />
          </div>
        </DropdownMenuItem>

        {/* Collapse System Prompts Toggle */}
        <DropdownMenuItem
          asChild
          onSelect={(e) => e.preventDefault()}
          className="px-2 py-1"
        >
          <div className="flex w-full items-center justify-between">
            <span className="mr-2">Collapse System Prompts</span>
            <Switch
              size="sm"
              checked={collapseSystemPrompt}
              onCheckedChange={(checked) => {
                // No analyticsDimensions: the inline toggle fires this event
                // from shared components without trace context, and the event
                // must keep one shape across sources.
                capture("trace_detail:system_prompt_collapse_toggle", {
                  collapsed: checked,
                  source: "settings",
                });
                setCollapseSystemPrompt(checked);
              }}
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
          <DropdownMenuLabel className="font-bold">
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
    </>
  );
}
