import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";
import { cn } from "@/src/utils/tailwind";
import { getExperimentColorStyles } from "./types";

/**
 * The list compare view's first column header: the Input label, the page
 * summary toggle that collapses every score column's aggregates, and the
 * selected experiment names in their marker colours so the stacked rows do
 * not need an Experiment column of their own.
 */
export function ExperimentListInputHeader({
  itemCount,
  expanded,
  onToggle,
  experiments,
  colorExperimentIds,
}: {
  itemCount: number;
  expanded: boolean;
  onToggle: () => void;
  experiments: Array<{ experimentId: string; experimentName: string }>;
  colorExperimentIds: string[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 py-0.5">
      <span className="truncate" title="Input">
        Input
      </span>
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
          <DropdownIndicator size="sm" nudge />
        ) : (
          <DropdownIndicator direction="right" size="sm" nudge />
        )}
        SUMMARY · this page ({itemCount} items)
      </button>
      {experiments.map((experiment) => {
        const colorStyles = getExperimentColorStyles(
          experiment.experimentId,
          colorExperimentIds,
        );
        return (
          <span
            key={experiment.experimentId}
            className={cn(
              "min-w-0 truncate text-xs font-bold",
              colorStyles.textClass,
            )}
            title={experiment.experimentName}
          >
            {experiment.experimentName}
          </span>
        );
      })}
    </div>
  );
}
