import { Badge } from "@/src/components/ui/badge";

type ScoreSimplified = {
  name: string;
  value: number;
};

export const GroupedScoreBadges = ({
  scores,
  variant = "badge",
}: {
  scores: ScoreSimplified[];
  variant?: "badge" | "headings";
}) => {
  const groupedScores = scores.reduce(
    (acc, score) => {
      if (!acc[score.name] || !Array.isArray(acc[score.name])) {
        acc[score.name] = [score];
      } else {
        (acc[score.name] as ScoreSimplified[]).push(score);
      }
      return acc;
    },
    {} as Record<string, ScoreSimplified[]>,
  );

  if (variant === "headings")
    return (
      <div className="flex items-center gap-3">
        {Object.entries(groupedScores)
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .map(([name, scores]) => (
            <div key={name}>
              <div className="text-xs text-gray-500">{name}</div>
              <div className="text-sm">
                {scores.map((s) => s.value.toFixed(2)).join(", ")}
              </div>
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
              {name}: {scores.map((s) => s.value.toFixed(2)).join(", ")}
            </Badge>
          ))}
      </>
    );
};
