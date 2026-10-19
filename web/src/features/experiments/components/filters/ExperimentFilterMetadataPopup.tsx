import { type FilterState } from "@langfuse/shared";
import { ExperimentFilterMetadataForm } from "./ExperimentFilterMetadataForm";
import { type MetadataFilterColumn } from "./experimentFilterTypes";

export function ExperimentFilterMetadataPopup({
  column,
  onAdd,
  onClose,
}: ExperimentFilterMetadataPopupProps) {
  function handleAdd(filter: FilterState[number]) {
    onAdd(filter);
    onClose();
  }
  return (
    <ExperimentFilterMetadataForm
      column={column}
      onAdd={handleAdd}
      onCancel={onClose}
    />
  );
}

type ExperimentFilterMetadataPopupProps = {
  column: MetadataFilterColumn;
  onAdd: (filter: FilterState[number]) => void;
  onClose: () => void;
};
