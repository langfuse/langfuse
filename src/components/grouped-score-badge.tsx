import { Badge } from "@/src/components/ui/badge";
import { type Score } from "@prisma/client";

export const GroupedScoreBadges = (props: { scores: Score[] }) => {
  const groupedScores = props.scores.reduce((acc, score) => {
    if (!acc[score.name] || !Array.isArray(acc[score.name])) {
      acc[score.name] = [score];
    } else {
      (acc[score.name] as Score[]).push(score);
    }
    return acc;
  }, {} as Record<string, Score[]>);

  return (
    <>
      {Object.entries(groupedScores).map(([name, scores]) => (
        <Badge variant="outline" key={name} className="break-all">
          {name}: {scores.map((s) => s.value).join(", ")}
        </Badge>
      ))}
    </>
  );
};
