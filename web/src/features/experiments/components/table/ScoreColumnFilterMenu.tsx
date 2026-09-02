/* eslint-disable @repo/no-abstracted-overlay-trigger */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Check, ListFilter } from "lucide-react";
import { type ScoreComparisonOperator } from "@/src/features/experiments/fns/scoreComparisonFilter";
import { cn } from "@/src/utils/tailwind";

export type ScoreComparisonTarget = {
  experimentId: string;
  experimentName: string;
};

const OPERATOR_LABELS: Record<ScoreComparisonOperator, string> = {
  lower: "Worse than",
  higher: "Better than",
  differs: "Different from",
};

const ORDERED_OPERATORS: ScoreComparisonOperator[] = [
  "lower",
  "higher",
  "differs",
];

/**
 * The score column's own way into the comparison filter: "show
 * only the items worse than <comparison> on this score", from the header of the
 * score in question, with the comparison to read against picked here rather than
 * assumed.
 */
export const ScoreColumnFilterMenu = ({
  targets,
  active,
  hasOrder,
  onSelect,
  onClear,
}: {
  /** The experiments this score can be read against, default first. */
  targets: ScoreComparisonTarget[];
  active?: {
    operator: ScoreComparisonOperator;
    comparisonExperimentId: string;
  };
  /** Categorical scores have no order, so only "different from" applies. */
  hasOrder: boolean;
  onSelect: (
    operator: ScoreComparisonOperator,
    comparisonExperimentId: string,
  ) => void;
  onClear: () => void;
}) => {
  if (targets.length === 0) return null;

  const operators = hasOrder ? ORDERED_OPERATORS : (["differs"] as const);
  const isActive = (operator: ScoreComparisonOperator, experimentId: string) =>
    active?.operator === operator &&
    active?.comparisonExperimentId === experimentId;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Filter items by this score"
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "hover:bg-muted mt-0.5 shrink-0 rounded-sm p-0.5",
            active
              ? "text-primary-accent"
              : "text-muted-foreground opacity-0 group-hover:opacity-100",
          )}
        >
          <ListFilter className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuLabel>Show only items</DropdownMenuLabel>
        {operators.map((operator) =>
          targets.length === 1 ? (
            <DropdownMenuItem
              key={operator}
              onClick={() => onSelect(operator, targets[0].experimentId)}
            >
              {isActive(operator, targets[0].experimentId) ? (
                <Check className="mr-2 h-4 w-4 shrink-0" />
              ) : (
                <span className="mr-2 h-4 w-4 shrink-0" />
              )}
              <span
                className="truncate"
                title={`${OPERATOR_LABELS[operator]} ${targets[0].experimentName}`}
              >
                {OPERATOR_LABELS[operator]} {targets[0].experimentName}
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub key={operator}>
              <DropdownMenuSubTrigger>
                {OPERATOR_LABELS[operator]}…
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="w-56">
                  {targets.map((target) => (
                    <DropdownMenuItem
                      key={target.experimentId}
                      onClick={() => onSelect(operator, target.experimentId)}
                    >
                      {isActive(operator, target.experimentId) ? (
                        <Check className="mr-2 h-4 w-4 shrink-0" />
                      ) : (
                        <span className="mr-2 h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate" title={target.experimentName}>
                        {target.experimentName}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
          ),
        )}
        {active && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear}>
              <span className="mr-2 h-4 w-4 shrink-0" />
              Remove this score&apos;s filter
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <span className="text-muted-foreground block px-2 py-1.5 text-[10px]">
          Compares the items loaded on this page — page through to check the
          rest of the run.
        </span>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
