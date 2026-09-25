import { ChevronDown, ChevronRight } from "lucide-react";

// Preview fixtures: replace with experiment aggregates when the layout is settled.
const SUMMARY_SCORES = [
  {
    name: "guess_efficiency",
    baseline: 81.3,
    comparisons: [22.97, 92.68],
    improved: [2, 25],
    regressed: [25, 2],
  },
  {
    name: "solved",
    baseline: 90.24,
    comparisons: [36.59, 100],
    improved: [2, 24],
    regressed: [24, 0],
  },
] as const;

export function ExperimentGridSummaryValues({
  comparisonIndex,
  expanded,
  showScoreNames,
  onToggle,
}: {
  comparisonIndex: number | null;
  expanded: boolean;
  showScoreNames: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-t py-1">
      <div className="h-6">
        {showScoreNames && (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex h-6 items-center gap-1 rounded text-left text-[10px] font-normal focus-visible:ring-2 focus-visible:outline-none"
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            SUMMARY · sample data
          </button>
        )}
      </div>
      {expanded &&
        SUMMARY_SCORES.map((score) => {
          const fixtureIndex =
            (comparisonIndex ?? 0) % score.comparisons.length;
          const value =
            comparisonIndex === null
              ? score.baseline
              : score.comparisons[fixtureIndex]!;
          const delta = value - score.baseline;
          const deltaLabel = `${delta > 0 ? "+" : ""}${delta.toFixed(2)} pp`;
          return (
            <div
              key={score.name}
              className="flex h-7 min-w-0 items-center gap-4 px-1 font-normal tabular-nums"
              aria-label={`${score.name}: ${value}`}
            >
              {showScoreNames && (
                <span
                  className="min-w-0 flex-1 truncate text-xs"
                  title={score.name}
                >
                  {score.name}
                </span>
              )}
              <div className="flex shrink-0 items-baseline gap-2 whitespace-nowrap">
                <span className="text-foreground text-xs">{value}</span>
                <span
                  className="text-muted-foreground text-xs"
                  title={
                    comparisonIndex === null
                      ? "Average score"
                      : "Percentage-point difference from baseline"
                  }
                >
                  {comparisonIndex === null ? "AVG" : deltaLabel}
                </span>
              </div>
              {comparisonIndex !== null && (
                <div className="flex shrink-0 items-center gap-2 text-xs font-normal">
                  <span
                    className="text-dark-green"
                    title="Improved items"
                    aria-label={`${score.improved[fixtureIndex]} improved items`}
                  >
                    ↗ {score.improved[fixtureIndex]}
                  </span>
                  <span
                    className="text-dark-red"
                    title="Regressed items"
                    aria-label={`${score.regressed[fixtureIndex]} regressed items`}
                  >
                    ↘ {score.regressed[fixtureIndex]}
                  </span>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
