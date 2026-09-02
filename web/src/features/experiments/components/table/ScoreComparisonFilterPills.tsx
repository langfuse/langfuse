/* eslint-disable @repo/no-style-props */
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { GitCompareArrows, X } from "lucide-react";
import { cn } from "@/src/utils/tailwind";
import {
  describeScoreComparisonFilter,
  type ScoreComparisonFilter,
} from "@/src/features/experiments/fns/scoreComparisonFilter";

export type ScoreComparisonPill = {
  filter: ScoreComparisonFilter;
  scoreName: string;
  comparisonName: string;
};

/**
 * The active score comparisons, in plain English ("Worse groundedness than
 * judge-haiku-baseline") and removable — the same affordance the score filters
 * get, for the one predicate that is evaluated in the client.
 */
export const ScoreComparisonFilterPills = ({
  pills,
  onRemove,
  className,
}: {
  pills: ScoreComparisonPill[];
  onRemove: (filter: ScoreComparisonFilter) => void;
  className?: string;
}) => {
  if (pills.length === 0) return null;

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5 px-2 py-2", className)}
    >
      {pills.map(({ filter, scoreName, comparisonName }) => {
        const label = describeScoreComparisonFilter({
          operator: filter.operator,
          scoreName,
          comparisonName,
        });
        return (
          <Badge
            key={`${filter.level}-${filter.scoreKey}`}
            variant="secondary"
            className="flex max-w-full items-center gap-1 px-2 py-1 text-xs"
          >
            <GitCompareArrows className="h-3 w-3 shrink-0" />
            <span className="truncate" title={label}>
              {label}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground shrink-0 cursor-default underline decoration-dotted">
                  this page
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px]">
                Comparing one experiment&apos;s score against another&apos;s is
                not something the items query can express, so this narrows the
                items loaded on the current page. Page through to check the rest
                of the run.
              </TooltipContent>
            </Tooltip>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 shrink-0 p-0 hover:bg-transparent"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(filter);
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </Badge>
        );
      })}
    </div>
  );
};
