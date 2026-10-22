import { type FilterState } from "@langfuse/shared";
import { ExperimentFilterCreationChoice } from "./ExperimentFilterCreationChoice";
import { ExperimentFilterMetadataChoice } from "./ExperimentFilterMetadataChoice";
import { type ExperimentFilterCreationChoice as CreationChoice } from "./experimentFilterCreationChoices";

export function ExperimentFilterAvailableChoice({
  choice,
  onAdd,
  portalContainer,
}: ExperimentFilterAvailableChoiceProps) {
  function handleChoose(selected: CreationChoice) {
    if (selected.filter) onAdd(selected.filter);
  }
  if (choice.metadataColumn)
    return (
      <ExperimentFilterMetadataChoice
        column={choice.metadataColumn}
        choice={choice}
        onAdd={onAdd}
        portalContainer={portalContainer}
      />
    );
  return (
    <ExperimentFilterCreationChoice choice={choice} onChoose={handleChoose} />
  );
}

type ExperimentFilterAvailableChoiceProps = {
  choice: CreationChoice;
  onAdd: (filter: FilterState[number]) => void;
  portalContainer: HTMLElement | null;
};
