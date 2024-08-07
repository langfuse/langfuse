import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import {
  type CategoricalAggregate,
  type NumericAggregate,
} from "@/src/features/scores/lib/types";

import { numberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";
import { MessageCircleMore } from "lucide-react";

const COLOR_MAP = new Map([
  ["True", "bg-light-green p-0.5 text-dark-green"],
  ["False", "bg-light-red p-0.5 text-dark-red"],
]);
const COLLAPSE_CATEGORICAL_SCORES_AFTER = 2;

const ScoreValueCounts = ({
  valueCounts,
}: {
  valueCounts: CategoricalAggregate["valueCounts"];
}) => {
  return valueCounts.map(({ value, count }) => (
    <div key={value} className="flex flex-row">
      <span className="truncate">{value}</span>
      <span>{`: ${numberFormatter(count, 0)}`}</span>
    </div>
  ));
};

export const ScoresTableCell = ({
  aggregate,
  showSingleValue = false,
}: {
  aggregate: CategoricalAggregate | NumericAggregate;
  showSingleValue?: boolean;
}) => {
  if (showSingleValue && aggregate.values.length === 1) {
    const value =
      aggregate.type === "NUMERIC"
        ? aggregate.average.toFixed(4)
        : aggregate.values[0];

    return (
      <span
        className={cn("flex flex-row gap-0.5 rounded-sm", COLOR_MAP.get(value))}
      >
        {value}
        {aggregate.comment && (
          <HoverCard>
            <HoverCardTrigger className="inline-block cursor-pointer">
              <MessageCircleMore size={12} />
            </HoverCardTrigger>
            <HoverCardContent className="overflow-hidden whitespace-normal break-normal">
              <p>{aggregate.comment}</p>
            </HoverCardContent>
          </HoverCard>
        )}
      </span>
    );
  }

  if (aggregate.type === "NUMERIC") {
    return (
      <span className="rounded-sm">{`Ø ${aggregate.average.toFixed(4)}`}</span>
    );
  }

  return (
    <div className="group">
      {aggregate.valueCounts.length > COLLAPSE_CATEGORICAL_SCORES_AFTER ? (
        <HoverCard>
          <HoverCardTrigger>
            <div className="flex cursor-pointer flex-col group-hover:text-accent-dark-blue/55">
              <ScoreValueCounts
                valueCounts={aggregate.valueCounts.slice(
                  0,
                  COLLAPSE_CATEGORICAL_SCORES_AFTER,
                )}
              />
            </div>
          </HoverCardTrigger>
          <HoverCardContent className="z-20 flex max-h-[40vh] max-w-64 flex-col overflow-y-auto whitespace-normal break-normal">
            <ScoreValueCounts valueCounts={aggregate.valueCounts} />
          </HoverCardContent>
        </HoverCard>
      ) : (
        <div className="flex flex-col">
          <ScoreValueCounts valueCounts={aggregate.valueCounts} />
        </div>
      )}
    </div>
  );
};
