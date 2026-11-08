import { Button } from "@/src/components/design-system/Button/Button";
import { ExperimentFilterChoiceLabel } from "./ExperimentFilterChoiceLabel";
import { type ExperimentFilterCreationChoice as CreationChoice } from "./experimentFilterCreationChoices";

export function ExperimentFilterCreationChoice({
  choice,
  onChoose,
}: ExperimentFilterCreationChoiceProps) {
  function handleClick() {
    onChoose(choice);
  }
  return (
    <div className="flex flex-col items-start gap-1 rounded-md border p-2">
      <Button
        text={choice.label}
        variant="ghost"
        size="sm"
        disabled={choice.isDisabled}
        onClick={handleClick}
      />
      <ExperimentFilterChoiceLabel choice={choice} />
    </div>
  );
}

type ExperimentFilterCreationChoiceProps = {
  choice: CreationChoice;
  onChoose: (choice: CreationChoice) => void;
};
