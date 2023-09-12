import { Badge } from "@/src/components/ui/badge";
import { type Score } from "@prisma/client";

export const GroupedScoreBadges = (props: {
  scores: Score[];
  inline?: boolean;
}) => {
  const groupedScores = props.scores.reduce(
    (acc, score) => {
      if (!acc[score.name] || !Array.isArray(acc[score.name])) {
        acc[score.name] = [score];
      } else {
        (acc[score.name] as Score[]).push(score);
      }
      return acc;
    },
    {} as Record<string, Score[]>,
  );

  return (
    <>
      {Object.entries(groupedScores)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, scores]) =>
          props.inline ? (
            <span key={name} className="break-all font-normal">
              {name}: {scores.map((s) => s.value).join(", ")}
            </span>
          ) : (
            <Badge
              variant="outline"
              key={name}
              className="break-all font-normal"
            >
              {name}: {scores.map((s) => s.value).join(", ")}
            </Badge>
          ),
        )}
    </>
  );
};
