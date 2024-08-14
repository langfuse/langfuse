import { Badge } from "@/src/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { MessageCircleMore } from "lucide-react";

import { type APIScore } from "@langfuse/shared";
import { type LastUserScore } from "@/src/features/scores/lib/types";

export const GroupedScoreBadges = <T extends APIScore | LastUserScore>({
  scores,
}: {
  scores: T[];
}) => {
  const groupedScores = scores.reduce<Record<string, T[]>>((acc, score) => {
    if (!acc[score.name] || !Array.isArray(acc[score.name])) {
      acc[score.name] = [score];
    } else {
      acc[score.name].push(score);
    }
    return acc;
  }, {});

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
            <div className="flex items-center gap-1 text-nowrap">
              {scores.map((s, i) => (
                <span
                  key={i}
                  className="group/score ml-1 rounded-sm first:ml-0"
                >
                  {s.stringValue ?? s.value?.toFixed(2) ?? ""}
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
          </Badge>
        ))}
    </>
  );
};
