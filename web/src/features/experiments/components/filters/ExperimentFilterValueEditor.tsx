import { type ChangeEvent } from "react";
import { Input } from "@/src/components/design-system/Input/Input";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { MultiSelectInput } from "@/src/components/design-system/MultiSelectInput/MultiSelectInput";
import { type ExperimentFilterDraft } from "./experimentFilterEditing";
import { type ExperimentFilterOptions } from "./experimentFilterTypes";

export function ExperimentFilterValueEditor({
  draft,
  options,
  onChange,
}: ExperimentFilterValueEditorProps) {
  function handleTextChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  if (draft.type === "stringOptions" || draft.type === "categoryOptions") {
    const values = Array.isArray(draft.value) ? draft.value : [];
    const offered =
      draft.type === "stringOptions"
        ? (options?.level ?? ["DEBUG", "DEFAULT", "WARNING", "ERROR"])
        : (options?.score_categories?.[draft.key] ?? []);
    return (
      <MultiSelectInput
        aria-label="Filter values"
        value={values}
        options={[...new Set([...offered, ...values])].map((value) => ({
          value,
          label: value,
        }))}
        onValueChange={onChange}
        placeholder="Select values"
        selectedLabel={values.join(", ")}
        searchPlaceholder="Search values"
        emptyMessage={options ? "No values for this score" : "Loading values…"}
      />
    );
  }
  if (draft.type === "booleanObject" || draft.type === "boolean")
    return (
      <SelectInput
        aria-label="Filter value"
        value={String(draft.value)}
        options={[
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ]}
        onValueChange={onChange}
        placeholder="Select value"
      />
    );
  return (
    <Input
      aria-label="Filter value"
      value={String(draft.value)}
      onChange={handleTextChange}
      placeholder="Value"
      inputMode={draft.type === "numberObject" ? "decimal" : "text"}
    />
  );
}

type ExperimentFilterValueEditorProps = {
  draft: ExperimentFilterDraft;
  options: ExperimentFilterOptions | undefined;
  onChange: (value: ExperimentFilterDraft["value"]) => void;
};
