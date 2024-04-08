import { Badge } from "@/src/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { type ScoreSimplified } from "@/src/server/api/routers/generations/getAllQuery";
import { cn } from "@/src/utils/tailwind";
import { MessageCircle } from "lucide-react";

export const GroupedScoreBadges = ({
  scores,
  variant = "badge",
}: {
  scores: ScoreSimplified[];
  variant?: "badge" | "headings";
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

  const ScoresOfGroup = (props: {
    scores: ScoreSimplified[];
    className?: string;
  }) => (
    <div className={cn("text-xs", props.className)}>
      {props.scores.map((s, i) => (
        <span key={i} className="group/score ml-1 first:ml-0">
          {s.value.toFixed(2)}
          {s.comment && (
            <HoverCard>
              <HoverCardTrigger className="ml-1 inline-block cursor-pointer">
                <MessageCircle size={12} />
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

  if (variant === "headings")
    return (
      <div className="flex items-center gap-3">
        {Object.entries(groupedScores)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([name, scores]) => (
            <div key={name}>
              <div className="text-xs text-gray-500">{name}</div>
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
              className="break-all font-normal"
            >
              {name}: <ScoresOfGroup scores={scores} className="ml-2" />
            </Badge>
          ))}
      </>
    );
};
