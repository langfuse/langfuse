import { Badge } from "@/src/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { MessageCircleMoreIcon } from "lucide-react";
import { type APIScore, type LastUserScore } from "@langfuse/shared";

const partitionScores = <T extends APIScore | LastUserScore>(
  scores: Record<string, T[]>,
  maxVisible?: number,
) => {
  const sortedScores = Object.entries(scores).sort(([a], [b]) =>
    a < b ? -1 : 1,
  );
  if (!maxVisible) return { visibleScores: sortedScores, hiddenScores: [] };

  const visibleScores = sortedScores.slice(0, maxVisible);
  const hiddenScores = sortedScores.slice(maxVisible);
  return { visibleScores, hiddenScores };
};

export const GroupedScoreBadges = <T extends APIScore | LastUserScore>({
  scores,
  maxVisible,
}: {
  scores: T[];
  maxVisible?: number;
}) => {
  const groupedScores = scores.reduce<Record<string, T[]>>((acc, score) => {
    if (!acc[score.name] || !Array.isArray(acc[score.name])) {
      acc[score.name] = [score];
    } else {
      acc[score.name].push(score);
    }
    return acc;
  }, {});

  const { visibleScores, hiddenScores } = partitionScores(
    groupedScores,
    maxVisible,
  );

  return (
    <>
      {visibleScores.map(([name, scores]) => {
        return (
          <Badge
            variant="tertiary"
            key={name}
            className="flex items-center gap-1 px-2.5 text-xs font-normal"
          >
            <div className="w-fit max-w-20 truncate" title={name}>
              {name}:
            </div>
            <div className="flex items-center gap-1 text-nowrap">
              {scores.map((s, i) => (
                <span
                  key={i}
                  className="group/score ml-1 flex items-center gap-1 rounded-sm first:ml-0"
                >
                  {s.stringValue ?? s.value?.toFixed(2) ?? ""}
                  {s.comment && (
                    <HoverCard>
                      <HoverCardTrigger className="inline-block">
                        <MessageCircleMoreIcon className="mb-[0.0625rem] !size-3" />
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
          </Badge>
        );
      })}
      {Boolean(hiddenScores.length) && (
        <HoverCard>
          <HoverCardTrigger className="inline-block rounded-sm">
            <Badge
              className="cursor-pointer px-1 text-xs font-medium"
              variant="tertiary"
            >
              +{hiddenScores.length}
            </Badge>
          </HoverCardTrigger>
          <HoverCardContent className="max-h-[300px] max-w-[200px] overflow-y-auto p-2">
            <div className="flex flex-wrap gap-1">
              {hiddenScores.map(([name, scores]) => (
                <Badge
                  variant="tertiary"
                  key={name}
                  className="flex items-center gap-1 px-2.5 text-xs font-normal"
                >
                  <div className="w-fit max-w-20 truncate" title={name}>
                    {name}:
                  </div>
                  <div className="flex items-center gap-1 text-nowrap">
                    {scores.map((s, i) => (
                      <span
                        key={i}
                        className="group/score ml-1 flex items-center gap-1 rounded-sm first:ml-0"
                      >
                        {s.stringValue ?? s.value?.toFixed(2) ?? ""}
                        {s.comment && (
                          <HoverCard>
                            <HoverCardTrigger className="inline-block">
                              <MessageCircleMoreIcon className="mb-[0.0625rem] !size-3" />
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
                </Badge>
              ))}
            </div>
          </HoverCardContent>
        </HoverCard>
      )}
    </>
  );
};
