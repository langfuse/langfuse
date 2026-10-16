import { ScoreTag } from "@/src/components/score-tag";
import { type ExperimentFilterCreationChoice } from "./experimentFilterCreationChoices";

export function ExperimentFilterChoiceLabel({
  choice,
}: ExperimentFilterChoiceLabelProps) {
  return (
    <span className="flex min-w-0 flex-col gap-1 text-left">
      <span className="text-muted-foreground text-xs break-all">
        {choice.description}
      </span>
      {choice.levels.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {choice.levels.map((level) => (
            <ScoreTag key={level} level={level} />
          ))}
        </span>
      )}
    </span>
  );
}

type ExperimentFilterChoiceLabelProps = {
  choice: ExperimentFilterCreationChoice;
};
