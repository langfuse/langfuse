import { Badge } from "@/src/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import {
  type QuantitativeAggregate,
  type QualitativeAggregate,
} from "@/src/features/manual-scoring/lib/aggregateScores";
import { type APIScore } from "@/src/features/public-api/types/scores";

import { numberFormatter } from "@/src/utils/numbers";
import { cn } from "@/src/utils/tailwind";
import { MessageCircleMore } from "lucide-react";

const colorCoding = (value: string): string => {
  if (value === "True") return "bg-light-green p-0.5 text-dark-green";
  else if (value === "False") return "bg-light-red p-0.5 text-dark-red";
  return "";
};

const SingleScoreValue = ({
  value,
  comment,
  key,
  showColorCoding = false,
}: {
  value: string;
  comment?: string | null;
  key?: number;
  showColorCoding?: boolean;
}) => {
  return (
    <span
      key={key}
      className={cn(
        "group/score ml-1 rounded-sm first:ml-0",
        showColorCoding && colorCoding(value),
      )}
    >
      {value}
      {comment && (
        <HoverCard>
          <HoverCardTrigger className="ml-1 inline-block cursor-pointer">
            <MessageCircleMore size={12} />
          </HoverCardTrigger>
          <HoverCardContent className="overflow-hidden whitespace-normal break-normal">
            <p>{comment}</p>
          </HoverCardContent>
        </HoverCard>
      )}
      <span className="group-last/score:hidden">,</span>
    </span>
  );
};

const DETAIL_HOVER_AFTER = 2;

export const ScoresAggregateCell = ({
  aggregate,
  showSingleValue = false,
}: {
  aggregate: QualitativeAggregate | QuantitativeAggregate;
  showSingleValue?: boolean;
}) => {
  if (showSingleValue && aggregate.values.length === 1) {
    return (
      <SingleScoreValue
        value={
          aggregate.type === "QUALITATIVE"
            ? aggregate.values[0]
            : aggregate.average.toFixed(2)
        }
        comment={aggregate.comment}
        showColorCoding
      />
    );
  }

  if (aggregate.type === "QUANTITATIVE") {
    return (
      <SingleScoreValue
        value={`Ø ${aggregate.average.toFixed(2)}`}
        showColorCoding
      />
    );
  } else if (aggregate.type === "QUALITATIVE") {
    return (
      <div className="group">
        {aggregate.distribution.length > DETAIL_HOVER_AFTER ? (
          <HoverCard>
            <HoverCardTrigger>
              <div className="flex cursor-pointer flex-col group-hover:text-accent-dark-blue/55">
                {aggregate.distribution
                  .slice(0, DETAIL_HOVER_AFTER)
                  .map(({ value, count }) => (
                    <span key={value} className="truncate">
                      {`${value}: ${numberFormatter(count, 0)}`}
                    </span>
                  ))}
              </div>
            </HoverCardTrigger>
            <HoverCardContent className="z-20 flex max-h-[40vh] max-w-64 flex-col overflow-y-auto whitespace-normal break-normal">
              {aggregate.distribution.map(({ value, count }) => (
                <div className="truncate" key={value}>
                  {value}: {numberFormatter(count, 0)}
                </div>
              ))}
            </HoverCardContent>
          </HoverCard>
        ) : (
          <div className="flex flex-col">
            {aggregate.distribution.map(({ value, count }) => (
              <span key={value} className="truncate">
                {`${value}: ${numberFormatter(count, 0)}`}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
};

export const GroupedScoreBadges = ({ scores }: { scores: APIScore[] }) => {
  const groupedScores = scores.reduce<Record<string, APIScore[]>>(
    (acc, score) => {
      if (!acc[score.name] || !Array.isArray(acc[score.name])) {
        acc[score.name] = [score];
      } else {
        (acc[score.name] as APIScore[]).push(score);
      }
      return acc;
    },
    {},
  );

  return (
    <>
      {Object.entries(groupedScores)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, scores]) => (
          <Badge
            variant="outline"
            key={name}
            className="grid grid-cols-[1fr,auto] gap-1 font-normal"
          >
            <p className="truncate" title={name}>
              {name}:
            </p>
            <div className="text-xs">
              {scores.map((s, i) => (
                <SingleScoreValue
                  key={i}
                  value={s.stringValue ?? s.value?.toFixed(2) ?? ""}
                  comment={s.comment}
                />
              ))}
            </div>
          </Badge>
        ))}
    </>
  );
};
