import { useCallback } from "react";
import { ExternalLink } from "lucide-react";
import { ScoreCombobox } from "./charts/ScoreCombobox";
import { ObjectTypeFilter } from "./charts/ObjectTypeFilter";
import { TimeRangePicker } from "@/src/components/date-picker";
import { DASHBOARD_AGGREGATION_OPTIONS } from "@/src/utils/date-range-utils";
import { useAnalyticsUrlState } from "@/src/features/scores/components/score-analytics/libs/analytics-url-state";
import { type TimeRange } from "@/src/utils/date-range-utils";
import { type ScoreOption } from "./charts/ScoreCombobox";
import { Badge } from "@/src/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";

export interface ScoreAnalyticsHeaderProps {
  scoreOptions: ScoreOption[];
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
  compatibleScore2DataTypes?: string | string[];
}

/**
 * ScoreAnalyticsHeader - Header controls for score analytics
 *
 * Provides UI controls for:
 * - Score 1 selector (required)
 * - Score 2 selector (optional, for comparison)
 * - Object type filter (all, trace, session, observation, dataset_run)
 * - Time range picker
 *
 * Uses useAnalyticsUrlState hook to sync selections with URL query params.
 * Automatically clears score2 when score1 is cleared.
 *
 * Layout:
 * - Mobile: Stacked controls
 * - Desktop: Left (score selectors) | Spacer | Right (filters)
 */
export function ScoreAnalyticsHeader({
  scoreOptions,
  timeRange,
  onTimeRangeChange,
  compatibleScore2DataTypes,
}: ScoreAnalyticsHeaderProps) {
  const urlStateHook = useAnalyticsUrlState();
  const { state: urlState, setScore2, setObjectType } = urlStateHook;

  // Wrapper that clears score2 when score1 is cleared
  const setScore1 = useCallback(
    (value: string | undefined) => {
      urlStateHook.setScore1(value);

      // Always clear score2 when clearing score1
      if (value === undefined) {
        urlStateHook.setScore2(undefined);
      }
    },
    [urlStateHook],
  );

  return (
    <div className="flex flex-col gap-1 border-b border-border p-2 lg:flex-row lg:items-center lg:gap-4">
      {/* Left: Score Selectors */}
      <div className="flex items-center gap-2">
        <ScoreCombobox
          value={urlState.score1}
          onChange={setScore1}
          options={scoreOptions}
          placeholder="First score"
          className="h-8 w-[200px]"
        />
        <ScoreCombobox
          value={urlState.score2}
          onChange={setScore2}
          options={scoreOptions}
          placeholder="Second score"
          filterByDataType={compatibleScore2DataTypes}
          disabled={!urlState.score1}
          className="h-8 w-[200px]"
        />
        <HoverCard>
          <HoverCardTrigger asChild>
            <Badge variant="warning" className="cursor-help">
              Beta Feature
            </Badge>
          </HoverCardTrigger>
          <HoverCardContent className="w-80">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Beta Feature</h4>
              <p className="text-sm text-muted-foreground">
                Score analytics is currently in beta. We&apos;re actively
                improving this feature and would love to hear your feedback.
              </p>
              <a
                href="https://langfuse.com/discussions"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Share feedback on GitHub Discussions
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* Middle: Spacer (hidden on mobile) */}
      <div className="hidden flex-1 lg:block" />

      {/* Right: Filters */}
      <div className="flex items-center gap-2">
        <ObjectTypeFilter
          value={urlState.objectType}
          onChange={setObjectType}
          className="h-8 w-[140px]"
        />
        <TimeRangePicker
          timeRange={timeRange}
          onTimeRangeChange={onTimeRangeChange}
          timeRangePresets={DASHBOARD_AGGREGATION_OPTIONS}
          className="my-0"
        />
      </div>
    </div>
  );
}
