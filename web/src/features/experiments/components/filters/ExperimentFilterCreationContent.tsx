import { useState } from "react";
import { type FilterState } from "@langfuse/shared";
import { ExperimentFilterMetadataForm } from "./ExperimentFilterMetadataForm";
import { ExperimentFilterCreationChoice } from "./ExperimentFilterCreationChoice";
import {
  experimentFilterCreationChoices,
  type ExperimentFilterCreationChoice as CreationChoice,
} from "./experimentFilterCreationChoices";
import {
  type ExperimentFilterOptions,
  type MetadataFilterColumn,
} from "./experimentFilterTypes";

/** Creation buffers unmount with the popover; only complete conditions escape. */
export function ExperimentFilterCreationContent({
  options,
  optionsError,
  onAdd,
  onCancel,
}: ExperimentFilterCreationContentProps) {
  const [metadataColumn, setMetadataColumn] =
    useState<MetadataFilterColumn | null>(null);

  function handleChoose(choice: CreationChoice) {
    if (choice.metadataColumn) setMetadataColumn(choice.metadataColumn);
    else if (choice.filter) onAdd(choice.filter);
  }

  function handleCancel() {
    setMetadataColumn(null);
    onCancel();
  }

  function handleAdd(filter: FilterState[number]) {
    setMetadataColumn(null);
    onAdd(filter);
  }

  if (metadataColumn)
    return (
      <ExperimentFilterMetadataForm
        column={metadataColumn}
        onAdd={handleAdd}
        onCancel={handleCancel}
      />
    );

  return (
    <div className="ph-no-capture flex flex-col gap-1">
      <p className="text-muted-foreground px-2 pb-2 text-xs">
        Add to all experiments
      </p>
      {experimentFilterCreationChoices(options, optionsError).map((choice) => (
        <ExperimentFilterCreationChoice
          key={choice.column}
          choice={choice}
          onChoose={handleChoose}
        />
      ))}
    </div>
  );
}

type ExperimentFilterCreationContentProps = {
  options: ExperimentFilterOptions | undefined;
  optionsError: string | null;
  onAdd: (filter: FilterState[number]) => void;
  onCancel: () => void;
};
