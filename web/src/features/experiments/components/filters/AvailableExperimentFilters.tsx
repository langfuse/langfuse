import { type FilterState } from "@langfuse/shared";
import { ExperimentFilterAvailableChoice } from "./ExperimentFilterAvailableChoice";
import { experimentFilterCreationChoices } from "./experimentFilterCreationChoices";
import { type ExperimentFilterOptions } from "./experimentFilterTypes";

export function AvailableExperimentFilters({
  options,
  optionsError,
  onAdd,
  portalContainer,
}: AvailableExperimentFiltersProps) {
  return (
    <div
      className="ph-no-capture flex flex-col gap-1"
      aria-label="Available filters"
    >
      <p className="text-muted-foreground px-2 text-xs">Available filters</p>
      {experimentFilterCreationChoices(options, optionsError).map((choice) => (
        <ExperimentFilterAvailableChoice
          key={choice.column}
          choice={choice}
          onAdd={onAdd}
          portalContainer={portalContainer}
        />
      ))}
    </div>
  );
}

type AvailableExperimentFiltersProps = {
  options: ExperimentFilterOptions | undefined;
  optionsError: string | null;
  onAdd: (filter: FilterState[number]) => void;
  portalContainer: HTMLElement | null;
};
