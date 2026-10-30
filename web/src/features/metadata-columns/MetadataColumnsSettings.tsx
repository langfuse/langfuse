import { useId, useState } from "react";
import { type FilterState } from "@langfuse/shared";
import { Button } from "@/src/components/design-system/Button/Button";
import { Input } from "@/src/components/design-system/Input/Input";
import { KeyValueFilterBuilder } from "@/src/components/table/KeyValueFilterBuilder";
import {
  applyKeyedFilterEntries,
  type StringKeyValueFilterEntry,
} from "@/src/features/filters/lib/sidebar-filter-actions";
import {
  MAX_METADATA_COLUMNS,
  type MetadataColumnConfig,
} from "./metadata-columns";

type MetadataColumnsSettingsProps = {
  metadataColumns: MetadataColumnConfig[];
  onChange: (columns: MetadataColumnConfig[]) => void;
  keyOptions: string[];
  baseColumnCount: number;
  filterState: FilterState;
  onFilterChange: (filters: FilterState) => void;
};

const isEditableOperator = (
  operator: string,
): operator is StringKeyValueFilterEntry["operator"] =>
  ["=", "contains", "does not contain", "is set", "is not set"].includes(
    operator,
  );

export function MetadataColumnsSettings({
  metadataColumns,
  onChange,
  keyOptions,
  baseColumnCount,
  filterState,
  onFilterChange,
}: MetadataColumnsSettingsProps) {
  const keyInputId = useId();
  const [newKey, setNewKey] = useState("");
  const [editingFilter, setEditingFilter] = useState<{
    key: string;
    entries: StringKeyValueFilterEntry[];
  } | null>(null);
  const duplicateKey = metadataColumns.some((column) => column.key === newKey);
  const atLimit = metadataColumns.length >= MAX_METADATA_COLUMNS;
  const hasAdditionalConditions =
    editingFilter !== null &&
    filterState.some(
      (filter) =>
        filter.column === "metadata" &&
        filter.type === "stringObject" &&
        filter.key === editingFilter.key &&
        !isEditableOperator(filter.operator),
    );
  const observedKeys = Array.from(new Set(keyOptions))
    .filter(
      (key) =>
        !metadataColumns.some((column) => column.key === key) &&
        key.toLowerCase().includes(newKey.toLowerCase()),
    )
    .slice(0, 5);

  const openFilter = (key: string) => {
    const entries = filterState.flatMap<StringKeyValueFilterEntry>((filter) =>
      filter.column === "metadata" &&
      filter.type === "stringObject" &&
      filter.key === key &&
      isEditableOperator(filter.operator)
        ? [
            {
              key: filter.key,
              operator: filter.operator,
              value: filter.value,
              ...(filter.target ? { target: filter.target } : {}),
            },
          ]
        : [],
    );
    setEditingFilter({
      key,
      entries: entries.length
        ? entries
        : [{ key, operator: "contains", value: "" }],
    });
  };

  const applyFilter = () => {
    if (!editingFilter) return;
    const otherFilters = filterState.filter(
      (filter) =>
        !(
          filter.column === "metadata" &&
          filter.type === "stringObject" &&
          filter.key === editingFilter.key &&
          isEditableOperator(filter.operator)
        ),
    );
    const editedFilters = applyKeyedFilterEntries([], "metadata", {
      kind: "stringObject",
      entries: editingFilter.entries,
    });
    onFilterChange([...otherFilters, ...editedFilters]);
    setEditingFilter(null);
  };

  return (
    <section className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-bold">Metadata columns</h3>
        <p className="text-muted-foreground text-xs">
          Saved in this browser for this project. Saved views include metadata
          filters, but do not include these columns.
        </p>
      </div>

      {metadataColumns.map((column) => (
        <div
          key={column.key}
          className="ph-no-capture flex flex-col gap-2 rounded border p-2"
        >
          <span className="truncate font-mono text-xs" title={column.key}>
            {column.key}
          </span>
          <Input
            aria-label={`Display label for ${column.key}`}
            placeholder={column.key}
            maxLength={200}
            value={column.label ?? ""}
            onChange={(event) =>
              onChange(
                metadataColumns.map((item) =>
                  item.key === column.key
                    ? { ...item, label: event.target.value }
                    : item,
                ),
              )
            }
          />
          <div className="flex gap-2">
            <Button
              text="Filter"
              variant="outline"
              size="sm"
              onClick={() => openFilter(column.key)}
            />
            <Button
              text="Remove column"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(
                  metadataColumns.filter((item) => item.key !== column.key),
                );
                if (editingFilter?.key === column.key) setEditingFilter(null);
              }}
            />
          </div>
        </div>
      ))}

      <div className="ph-no-capture flex flex-col gap-2">
        <label htmlFor={keyInputId} className="text-xs font-bold">
          Metadata key
        </label>
        <Input
          id={keyInputId}
          placeholder="Enter a top-level key"
          value={newKey}
          maxLength={1000}
          disabled={atLimit}
          error={duplicateKey}
          aria-invalid={duplicateKey}
          onChange={(event) => setNewKey(event.target.value)}
        />
        {observedKeys.length > 0 && !atLimit && (
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Observed keys</span>
            <div className="flex flex-wrap gap-1 overflow-x-auto">
              {observedKeys.map((key) => (
                <Button
                  key={key}
                  text={key}
                  variant="outline"
                  size="sm"
                  onClick={() => setNewKey(key)}
                />
              ))}
            </div>
          </div>
        )}
        {duplicateKey && (
          <p className="text-destructive text-xs" role="alert">
            This key already has a column.
          </p>
        )}
        {atLimit && (
          <p className="text-muted-foreground text-xs">
            Up to {MAX_METADATA_COLUMNS} metadata columns.
          </p>
        )}
        <Button
          text="Add metadata column"
          variant="outline"
          disabled={newKey.length === 0 || duplicateKey || atLimit}
          onClick={() => {
            if (!newKey || duplicateKey || atLimit) return;
            onChange([
              ...metadataColumns,
              {
                key: newKey,
                visible: true,
                position: baseColumnCount + metadataColumns.length,
              },
            ]);
            setNewKey("");
          }}
        />
      </div>

      {editingFilter && (
        <div className="ph-no-capture flex flex-col gap-3 border-t pt-3">
          <p className="text-muted-foreground text-xs">
            Filter metadata by text. Arrays and objects are matched as JSON
            text.
          </p>
          {hasAdditionalConditions && (
            <p className="text-muted-foreground text-xs">
              Other conditions for this key are still applied. Edit them in the
              filter sidebar.
            </p>
          )}
          <KeyValueFilterBuilder
            key={editingFilter.key}
            mode="string"
            keyOptions={[]}
            keyPlaceholder="Metadata key"
            activeFilters={editingFilter.entries}
            onChange={(entries) =>
              setEditingFilter({ ...editingFilter, entries })
            }
          />
          <div className="flex gap-2">
            <Button text="Apply filter" size="sm" onClick={applyFilter} />
            <Button
              text="Cancel"
              variant="ghost"
              size="sm"
              onClick={() => setEditingFilter(null)}
            />
          </div>
        </div>
      )}
    </section>
  );
}
