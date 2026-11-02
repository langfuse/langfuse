import { useForm } from "react-hook-form";
import { type FilterState } from "@langfuse/shared";
import { Input } from "@/src/components/design-system/Input/Input";
import { Button } from "@/src/components/design-system/Button/Button";
import {
  completeExperimentFilter,
  newExperimentFilterDraft,
} from "./experimentFilterEditing";
import { type MetadataFilterColumn } from "./experimentFilterTypes";

export function ExperimentFilterMetadataForm({
  column,
  onAdd,
  onCancel,
}: ExperimentFilterMetadataFormProps) {
  const form = useForm<{ key: string }>({ defaultValues: { key: "" } });
  const key = form.watch("key");
  const filter = completeMetadataFilter(column, key);

  function handleAdd(values: { key: string }) {
    const completed = completeMetadataFilter(column, values.key);
    if (!completed) return;
    form.reset({ key: "" });
    onAdd(completed);
  }

  function handleCancel() {
    form.reset({ key: "" });
    onCancel();
  }

  const handleSubmit = form.handleSubmit(handleAdd);

  return (
    <form
      className="ph-no-capture flex flex-col gap-3"
      aria-label="Add metadata filter"
      onSubmit={handleSubmit}
    >
      <span className="text-sm font-bold">
        {column === "itemMetadata" ? "Item metadata" : "Metadata"}
      </span>
      <p className="text-muted-foreground text-xs">
        Key is set · All experiments
      </p>
      <Input
        aria-label="Metadata key"
        placeholder="Metadata key"
        {...form.register("key")}
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button
          text="Cancel"
          variant="ghost"
          size="sm"
          onClick={handleCancel}
        />
        <Button text="Add filter" type="submit" size="sm" disabled={!filter} />
      </div>
    </form>
  );
}

function completeMetadataFilter(column: MetadataFilterColumn, key: string) {
  return completeExperimentFilter({
    ...newExperimentFilterDraft(column),
    operator: "is set",
    key,
  });
}

type ExperimentFilterMetadataFormProps = {
  column: MetadataFilterColumn;
  onAdd: (filter: FilterState[number]) => void;
  onCancel: () => void;
};
