import { useRef } from "react";
import { ChevronDown } from "lucide-react";
import DocPopup from "@/src/components/layouts/doc-popup";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { SCORE_OUTLIER_STRIP_METRICS } from "@/src/features/scores-chart-view/constants/scoreOutlierStripMetrics";
import {
  type ScoreOutlierAggKey,
  type ScoreOutlierMetricKey,
} from "@/src/features/scores-chart-view/types";

const MODE_OPTIONS: ScoreOutlierMetricKey[] = ["count", "value"];

const modeLabel = (mode: ScoreOutlierMetricKey): string =>
  SCORE_OUTLIER_STRIP_METRICS[mode].shortLabel;

/**
 * Prevent Radix's close-refocus ONLY after a pointer-driven selection — the
 * programmatic refocus renders as a keyboard-style outline on the trigger.
 */
const usePointerSelectionFocusGuard = () => {
  const selectedViaPointerRef = useRef(false);
  return {
    markPointerSelection: (event: { detail: number }) => {
      if (event.detail > 0) selectedViaPointerRef.current = true;
    },
    onCloseAutoFocus: (event: Event) => {
      if (selectedViaPointerRef.current) {
        event.preventDefault();
        selectedViaPointerRef.current = false;
      }
    },
  };
};

/**
 * The small controls row above the outlier strip's bars: the mode
 * ("Count"/"Value") dropdown, the value-mode info popup, and the
 * aggregation (avg/min/max) dropdown when there's a choice. Pulled out of
 * `ScoresOutlierStrip` (the data-fetching container) so it's a plain,
 * storyable component — verifying something purely visual like the info
 * icon's alignment shouldn't require mocking `dashboard.executeQuery`.
 */
export function ScoreOutlierStripHeader({
  mode,
  onModeChange,
  aggregation,
  aggOptions,
  onAggregationChange,
}: {
  mode: ScoreOutlierMetricKey;
  onModeChange: (mode: ScoreOutlierMetricKey) => void;
  aggregation: ScoreOutlierAggKey;
  aggOptions: readonly ScoreOutlierAggKey[];
  onAggregationChange: (aggregation: ScoreOutlierAggKey) => void;
}) {
  const modeFocusGuard = usePointerSelectionFocusGuard();
  const aggregationFocusGuard = usePointerSelectionFocusGuard();
  const def = SCORE_OUTLIER_STRIP_METRICS[mode];

  // "Count" covers every score type; "Value" only reflects numeric/Boolean
  // rows, so flag that explicitly rather than leaving it a silent gap.
  const valueModeInfo =
    mode === "value" ? (
      <DocPopup description="Categorical and text scores have no numeric value, so they're excluded from Value." />
    ) : null;

  const modeMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Chart mode: ${modeLabel(mode)}`}
        className="text-foreground hover:text-muted-foreground flex items-center gap-0.5 text-xs leading-none font-bold"
      >
        {modeLabel(mode)}
        <ChevronDown className="h-2.5 w-2.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={modeFocusGuard.onCloseAutoFocus}
      >
        {MODE_OPTIONS.map((nextMode) => (
          <DropdownMenuItem
            key={nextMode}
            onClick={(event) => {
              modeFocusGuard.markPointerSelection(event);
              if (nextMode !== mode) onModeChange(nextMode);
            }}
            className="text-xs"
          >
            {modeLabel(nextMode)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const aggregationMenu =
    aggOptions.length > 1 ? (
      <span className="flex items-baseline gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`${def.shortLabel} aggregation: ${aggregation}`}
            className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-xs leading-none underline-offset-2 hover:underline"
          >
            {aggregation}
            <ChevronDown className="h-2.5 w-2.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            onCloseAutoFocus={aggregationFocusGuard.onCloseAutoFocus}
          >
            {aggOptions.map((agg) => (
              <DropdownMenuItem
                key={agg}
                onClick={(event) => {
                  aggregationFocusGuard.markPointerSelection(event);
                  if (agg !== aggregation) onAggregationChange(agg);
                }}
                className="text-xs"
              >
                {agg}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    ) : null;

  return (
    // `items-center`, not `items-baseline`: the info icon has no text
    // baseline to align against, and both text triggers share the same
    // `text-xs leading-none` line height, so centering by box (not text
    // metrics) lines everything up without any one-off icon offset.
    <div className="flex items-center gap-1.5">
      {/* Tighter gap than the row's own `gap-1.5`: the icon annotates
          "Value" specifically, so it reads as attached to it rather than
          floating evenly between it and the aggregation dropdown. */}
      <span className="flex items-center gap-1">
        {modeMenu}
        {valueModeInfo}
      </span>
      {/* The bar's aggregate must be legible where there is a choice
          (avg/min/max); single-option metrics are unambiguous and render no
          aggregation label. */}
      {aggregationMenu}
    </div>
  );
}
