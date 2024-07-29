import { Badge } from "@/src/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import {
  isBooleanDataType,
  isCategoricalDataType,
} from "@/src/features/manual-scoring/lib/helpers";
import { type ScoreSimplified } from "@/src/server/api/routers/generations/getAllQuery";
import { numberFormatter } from "@/src/utils/numbers";
import { truncate } from "@/src/utils/string";
import { cn } from "@/src/utils/tailwind";
import { MessageCircleMore } from "lucide-react";

const ScoresOfGroup = (props: {
  scores: ScoreSimplified[];
  className?: string;
}) => (
  <div className={cn("text-xs", props.className)}>
    {props.scores.map((s, i) => (
      <span key={i} className="group/score ml-1 first:ml-0">
        {isCategoricalDataType(s.dataType) || isBooleanDataType(s.dataType)
          ? s.stringValue
          : s.value?.toFixed(2)}
        {s.comment && (
          <HoverCard>
            <HoverCardTrigger className="ml-1 inline-block cursor-pointer">
              <MessageCircleMore size={12} />
            </HoverCardTrigger>
            <HoverCardContent className="overflow-hidden whitespace-normal break-normal">
              <p>{s.comment}</p>
            </HoverCardContent>
          </HoverCard>
        )}
        <span className="group-last/score:hidden">,</span>
      </span>
    ))}
  </div>
);

export const GroupedScoreBadges = ({
  scores,
  variant = "badge",
  showScoreNameHeading = true,
}: {
  scores: ScoreSimplified[];
  variant?: "badge" | "headings";
  showScoreNameHeading?: boolean;
}) => {
  const groupedScores = scores.reduce<Record<string, ScoreSimplified[]>>(
    (acc, score) => {
      if (!acc[score.name] || !Array.isArray(acc[score.name])) {
        acc[score.name] = [score];
      } else {
        (acc[score.name] as ScoreSimplified[]).push(score);
      }
      return acc;
    },
    {},
  );

  if (variant === "headings")
    return (
      <div className="flex items-center gap-3">
        {Object.entries(groupedScores)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([name, scores]) => (
            <div key={name}>
              {showScoreNameHeading && (
                <div className="text-xs text-muted-foreground">{name}</div>
              )}
              <ScoresOfGroup scores={scores} />
            </div>
          ))}
      </div>
    );
  else
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
              <ScoresOfGroup scores={scores} />
            </Badge>
          ))}
      </>
    );
};

type QualitativeScoreDistribution = {
  value: string;
  count: number;
};

const TRUNCATE_AFTER = 7;
const DETAIL_HOVER_AFTER = 2;

const QualitativeScoreDetails = ({
  name,
  distribution,
}: {
  name: string;
  distribution: QualitativeScoreDistribution[];
}) => {
  return (
    <>
      <span className="mb-2 text-sm font-bold">{name}</span>
      {distribution.map(({ value, count }) => (
        <div
          className="grid grid-cols-6 items-center gap-1 space-y-1"
          key={value}
        >
          <span
            className="col-span-3"
            title={value.length > 20 ? value : undefined}
          >
            {`${truncate(value, 20)}`}
          </span>
          <span className="col-span-1">→</span>
          <span className="col-span-2 flex flex-row">
            <div className="h-2 w-4 flex-shrink"></div>
            <div className="text-nowrap">{`∑ ${numberFormatter(count, 0)}`}</div>
          </span>
        </div>
      ))}
    </>
  );
};

export const QualitativeScoreBadge = ({
  scores,
}: {
  scores: Record<string, QualitativeScoreDistribution[]>;
}) => {
  const sortedScores = Object.entries(scores).map(([k, v]) => ({
    name: k,
    distribution: v.sort((a, b) => b.count - a.count),
  }));

  return (
    <div className="flex items-start gap-3">
      {sortedScores.map(({ name, distribution }) => (
        <div key={name} className="group">
          {distribution.length > DETAIL_HOVER_AFTER ? (
            <HoverCard>
              <HoverCardTrigger>
                <div className="text-xs text-muted-foreground group-hover:text-accent-dark-blue/55">
                  {name}
                </div>
                <div className="flex cursor-pointer flex-col group-hover:text-accent-dark-blue/55">
                  {distribution
                    .slice(0, DETAIL_HOVER_AFTER)
                    .map(({ value, count }) => (
                      <span key={value}>
                        {`${truncate(value, TRUNCATE_AFTER)} → ∑ ${numberFormatter(count, 0)}`}
                      </span>
                    ))}
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="z-20 flex max-h-[40vh] max-w-64 flex-col overflow-y-auto whitespace-normal break-normal">
                <QualitativeScoreDetails
                  name={name}
                  distribution={distribution}
                ></QualitativeScoreDetails>
              </HoverCardContent>
            </HoverCard>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">{name}</div>
              <div className="flex flex-col">
                {distribution.map(({ value, count }) => (
                  <span
                    key={value}
                    title={value.length > TRUNCATE_AFTER ? value : undefined}
                  >
                    {`${truncate(value, TRUNCATE_AFTER)} → ∑ ${numberFormatter(count, 0)}`}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
};
