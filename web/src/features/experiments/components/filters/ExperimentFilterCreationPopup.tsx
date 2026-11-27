import { type ComponentProps } from "react";
import { type FilterState } from "@langfuse/shared";
import { ExperimentFilterCreationContent } from "./ExperimentFilterCreationContent";

export function ExperimentFilterCreationPopup({
  options,
  optionsError,
  onAdd,
  onClose,
}: ExperimentFilterCreationPopupProps) {
  function handleAdd(filter: FilterState[number]) {
    onAdd(filter);
    onClose();
  }
  return (
    <ExperimentFilterCreationContent
      options={options}
      optionsError={optionsError}
      onAdd={handleAdd}
      onCancel={onClose}
    />
  );
}

type ExperimentFilterCreationPopupProps = Pick<
  ComponentProps<typeof ExperimentFilterCreationContent>,
  "options" | "optionsError" | "onAdd"
> & { onClose: () => void };
