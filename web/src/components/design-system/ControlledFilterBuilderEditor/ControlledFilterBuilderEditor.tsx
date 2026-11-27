import { Fragment, useState } from "react";
import { Plus, X } from "@langfuse/icons";
import {
  filterOperators,
  normalizeLegacySessionPositionInTraceKey,
  singleFilter,
  type ColumnDefinition,
  type FilterState,
} from "@langfuse/shared";
import { Input } from "../Input/Input";
import { Banner } from "../Banner/Banner";
import { MultiSelectInput } from "../MultiSelectInput/MultiSelectInput";
import { SelectInput } from "../SelectInput/SelectInput";

type FilterDraft = Partial<
  Pick<FilterState[number], "column" | "operator" | "type" | "value" | "target">
> & { key?: string };

type PickerState = {
  rowIndex: number;
  field: "column" | "key" | "position" | "operator" | "value";
  search: string;
};

export type FilterBuilderColumn = ColumnDefinition & {
  /** Allow entering values beyond the suggestions for option columns. */
  allowCustomValues?: boolean;
};

type FilterBuilderAnalyticsEvent =
  | {
      type: "applied";
      column: string;
      filterType: FilterState[number]["type"];
      operator: FilterState[number]["operator"];
      valueCount: number;
      conditionCount: number;
      columnConditionCount: number;
    }
  | { type: "cleared"; clearedCount: number };

export function ControlledFilterBuilderEditor({
  draft,
  onDraftChange,
  onValuePickerOpen,
  columns,
  getColumnNotice,
  columnsHiddenUnlessSelected = [],
  operators: operatorOverrides,
  loadingColumnIds = [],
  stringObjectSuggestions,
  disabled,
  onAnalyticsEvent,
}: {
  draft: readonly FilterDraft[];
  onDraftChange: (
    draft: FilterDraft[],
    result: { validFilters: FilterState },
  ) => void;
  onValuePickerOpen?: (event: { columnId: string }) => void;
  columns: readonly FilterBuilderColumn[];
  getColumnNotice?: (
    column: ColumnDefinition,
  ) => { severity: "info" | "warning" | "error"; message: string } | undefined;
  columnsHiddenUnlessSelected?: readonly string[];
  operators?: Partial<Record<keyof typeof filterOperators, readonly string[]>>;
  loadingColumnIds?: readonly string[];
  stringObjectSuggestions?: {
    valuesByKey?: Readonly<
      Record<string, readonly { value: string; displayValue?: string }[]>
    >;
    onKeyChange?: (key: string) => void;
  };
  disabled?: boolean;
  onAnalyticsEvent?: (event: FilterBuilderAnalyticsEvent) => void;
}) {
  const [picker, setPicker] = useState<PickerState | null>(null);
  const findColumn = (identifier: string | undefined) =>
    columns.find((column) => column.name === identifier) ??
    columns.find(
      (column) =>
        identifier !== undefined &&
        (column.id === identifier || column.aliases?.includes(identifier)),
    );

  const getOperators = (type: keyof typeof filterOperators) =>
    filterOperators[type].filter(
      (operator) => operatorOverrides?.[type]?.includes(operator) ?? true,
    );

  const parseFilter = (filter: FilterDraft) => {
    const parsed = singleFilter.safeParse(filter);
    if (!parsed.success) return undefined;
    const column = findColumn(parsed.data.column);
    if (column?.type !== parsed.data.type) return undefined;
    return parsed.data;
  };

  const updateDraft = (
    next: FilterDraft[],
    action:
      | { type: "edit"; index: number }
      | { type: "remove" }
      | { type: "add" },
  ) => {
    const parsed = next.map(parseFilter);
    const validFilters = parsed.filter((filter) => filter !== undefined);
    if (onAnalyticsEvent && action.type === "edit") {
      const applied = parsed[action.index];
      if (applied && !parseFilter(draft[action.index])) {
        onAnalyticsEvent({
          type: "applied",
          column: applied.column,
          filterType: applied.type,
          operator: applied.operator,
          valueCount: Array.isArray(applied.value) ? applied.value.length : 1,
          conditionCount: validFilters.length,
          columnConditionCount: validFilters.filter(
            (filter) => filter.column === applied.column,
          ).length,
        });
      }
    }
    if (onAnalyticsEvent && action.type === "remove") {
      const previousCount = draft.map(parseFilter).filter(Boolean).length;
      const clearedCount = previousCount - validFilters.length;
      if (clearedCount > 0) onAnalyticsEvent({ type: "cleared", clearedCount });
    }
    onDraftChange(next, { validFilters });
  };

  return (
    <fieldset disabled={disabled} className="ph-no-capture grid min-w-0 gap-2">
      {draft.map((filter, index) => {
        const column = findColumn(filter.column);
        const pickerState = (field: PickerState["field"]) => {
          const active =
            picker?.rowIndex === index && picker.field === field
              ? picker
              : null;
          return {
            openState: {
              open: active !== null,
              onOpenChange: (open: boolean) => {
                if (open && !active) {
                  setPicker({ rowIndex: index, field, search: "" });
                  if (field === "value" && column) {
                    onValuePickerOpen?.({ columnId: column.id });
                  }
                } else if (!open && active) {
                  setPicker((current) =>
                    current?.rowIndex === index && current.field === field
                      ? null
                      : current,
                  );
                }
              },
            },
            searchState: {
              value: active?.search ?? "",
              onValueChange: (search: string) => {
                setPicker((current) =>
                  current?.rowIndex === index &&
                  current.field === field &&
                  search !== current.search
                    ? { ...current, search }
                    : current,
                );
              },
            },
          };
        };
        const columnPicker = pickerState("column");
        const operators = column ? getOperators(column.type) : [];
        const position = normalizeLegacySessionPositionInTraceKey(filter.key);
        const needsOrdinal =
          position === "nthFromStart" || position === "nthFromEnd";
        const numberColumn = column?.type === "number" ? column : undefined;
        const date =
          filter.type === "datetime" && filter.value instanceof Date
            ? filter.value
            : undefined;
        const objectColumn =
          column?.type === "numberObject" ||
          column?.type === "booleanObject" ||
          column?.type === "stringObject"
            ? column
            : undefined;
        const notice = column && getColumnNotice?.(column);
        const keyLabel = column?.type === "stringObject" ? "Key" : "Score";
        const keyOptions = objectColumn?.keyOptions?.filter(Boolean) ?? [];
        const suggestStringObject =
          column?.type === "stringObject" &&
          stringObjectSuggestions !== undefined;
        const suggestedValues = stringObjectSuggestions?.valuesByKey;
        const metadataKey = filter.key ?? "";
        const valueSuggestions =
          suggestedValues && Object.hasOwn(suggestedValues, metadataKey)
            ? suggestedValues[metadataKey]
            : [];
        const customOption = ({ query }: { query: string }) =>
          query
            ? { value: query, label: query, secondaryLabel: "Use custom value" }
            : undefined;
        const categoryColumn =
          column?.type === "categoryOptions" ? column : undefined;
        let valueOptions;
        if (categoryColumn) {
          valueOptions = (
            categoryColumn.options.find(({ label }) => label === filter.key)
              ?.values ?? []
          ).map((value) => ({ value, label: value }));
        } else if (
          column?.type === "arrayOptions" ||
          column?.type === "stringOptions"
        ) {
          valueOptions = column.options.map(({ value, displayValue }) => ({
            value,
            label: displayValue ?? value,
          }));
        }
        const updateRow = (next: FilterDraft) =>
          updateDraft(
            draft.map((row, rowIndex) => (rowIndex === index ? next : row)),
            { type: "edit", index },
          );

        return (
          <Fragment key={index}>
            <div className="flex flex-wrap items-center gap-2 [&>*:not(:last-child)]:w-auto [&>*:not(:last-child)]:min-w-0 [&>*:not(:last-child)]:flex-[1_1_7rem]">
              <SelectInput
                aria-label="Column"
                placeholder="Column"
                value={column?.name ?? ""}
                options={columns
                  .filter(
                    ({ id, name }) =>
                      column?.name === name ||
                      (!columnsHiddenUnlessSelected.includes(id) &&
                        !columnsHiddenUnlessSelected.includes(name)),
                  )
                  .map(({ name }) => ({ value: name, label: name }))}
                openState={columnPicker.openState}
                search={{
                  placeholder: "Search columns",
                  ...columnPicker.searchState,
                }}
                noCapture
                onValueChange={(name) => {
                  const selected = columns.find(
                    (column) => column.name === name,
                  );
                  if (!selected) return;
                  const operator = getOperators(selected.type)[0];
                  if (!operator) return;
                  let value: FilterDraft["value"];
                  if (
                    selected.type === "null" ||
                    operator === "is not empty" ||
                    operator === "is set" ||
                    operator === "is not set"
                  ) {
                    value = "";
                  } else if (
                    selected.type === "booleanObject" ||
                    selected.type === "boolean"
                  ) {
                    value = true;
                  }
                  updateRow({
                    column: name,
                    type: selected.type,
                    operator,
                    key:
                      selected.type === "positionInTrace" ? "last" : undefined,
                    value,
                  });
                }}
              />
              {suggestStringObject && (
                <SelectInput
                  aria-label="Key"
                  placeholder="Key"
                  value={filter.key ?? ""}
                  options={keyOptions.map((key) => ({
                    value: key,
                    label: key,
                  }))}
                  openState={pickerState("key").openState}
                  search={{
                    placeholder: "Search keys",
                    ...pickerState("key").searchState,
                  }}
                  getAdditionalOption={customOption}
                  noCapture
                  onValueChange={(key) => {
                    updateRow({ ...filter, key });
                    stringObjectSuggestions.onKeyChange?.(key);
                  }}
                />
              )}
              {!suggestStringObject &&
                (categoryColumn || keyOptions.length > 0) && (
                  <SelectInput
                    aria-label={keyLabel}
                    openState={pickerState("key").openState}
                    placeholder={keyLabel}
                    value={filter.key ?? ""}
                    options={(categoryColumn
                      ? categoryColumn.options.map(({ label }) => label)
                      : keyOptions
                    ).map((key) => ({ value: key, label: key }))}
                    noCapture
                    onValueChange={(key) =>
                      updateRow({
                        ...filter,
                        key,
                        value: categoryColumn ? undefined : filter.value,
                      })
                    }
                  />
                )}
              {!suggestStringObject &&
                objectColumn &&
                keyOptions.length === 0 && (
                  <Input
                    aria-label={keyLabel}
                    placeholder={keyLabel}
                    value={filter.key ?? ""}
                    noCapture
                    onChange={(event) =>
                      updateRow({ ...filter, key: event.target.value })
                    }
                  />
                )}
              {filter.type === "positionInTrace" && (
                <SelectInput
                  aria-label="Position"
                  openState={pickerState("position").openState}
                  placeholder="Position"
                  value={position ?? "last"}
                  options={[
                    { value: "first", label: "First" },
                    { value: "last", label: "Last" },
                    { value: "nthFromStart", label: "Nth from start" },
                    { value: "nthFromEnd", label: "Nth from end" },
                  ]}
                  onValueChange={(key) =>
                    updateRow({
                      ...filter,
                      key,
                      value:
                        key === "nthFromStart" || key === "nthFromEnd"
                          ? typeof filter.value === "number"
                            ? filter.value
                            : 1
                          : undefined,
                    })
                  }
                />
              )}
              <SelectInput
                aria-label="Operator"
                openState={pickerState("operator").openState}
                placeholder="Operator"
                value={filter.operator ?? ""}
                options={operators.map((operator) => ({
                  value: operator,
                  label: operator,
                }))}
                disabled={!column}
                onValueChange={(operator) => {
                  const selected = operators.find(
                    (option) => option === operator,
                  );
                  if (!column || !selected) return;
                  const needsNoValue =
                    operator === "is not empty" ||
                    operator === "is set" ||
                    operator === "is not set";
                  updateRow({
                    ...filter,
                    operator: selected,
                    value: needsNoValue ? "" : filter.value,
                  });
                }}
              />
              {(filter.type === "string" || filter.type === "stringObject") &&
                filter.operator !== "is not empty" &&
                filter.operator !== "is set" &&
                filter.operator !== "is not set" &&
                (suggestStringObject ? (
                  <SelectInput
                    aria-label="Value"
                    placeholder="Value"
                    value={typeof filter.value === "string" ? filter.value : ""}
                    options={valueSuggestions.map(
                      ({ value, displayValue }) => ({
                        value,
                        label: displayValue ?? value,
                      }),
                    )}
                    openState={pickerState("value").openState}
                    search={{
                      placeholder: "Search values",
                      ...pickerState("value").searchState,
                    }}
                    getAdditionalOption={customOption}
                    noCapture
                    onValueChange={(value) => updateRow({ ...filter, value })}
                  />
                ) : (
                  <Input
                    aria-label="Value"
                    placeholder="Value"
                    value={typeof filter.value === "string" ? filter.value : ""}
                    noCapture
                    onChange={(event) =>
                      updateRow({ ...filter, value: event.target.value })
                    }
                  />
                ))}
              {(filter.type === "number" ||
                filter.type === "numberObject" ||
                (filter.type === "positionInTrace" && needsOrdinal)) && (
                <Input
                  aria-label="Value"
                  placeholder="Value"
                  type="number"
                  min={
                    filter.type === "positionInTrace" ? 1 : numberColumn?.min
                  }
                  step={
                    filter.type === "positionInTrace"
                      ? 1
                      : (numberColumn?.step ?? "any")
                  }
                  value={typeof filter.value === "number" ? filter.value : ""}
                  noCapture
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    const valid =
                      filter.type === "positionInTrace"
                        ? Number.isInteger(value) && value >= 1
                        : Number.isFinite(value);
                    updateRow({
                      ...filter,
                      value: valid ? value : undefined,
                    });
                  }}
                />
              )}
              {filter.type === "datetime" && (
                <Input
                  aria-label="Date and time"
                  type="datetime-local"
                  step={1}
                  noCapture
                  value={
                    date && Number.isFinite(date.getTime())
                      ? new Date(
                          date.getTime() - date.getTimezoneOffset() * 60_000,
                        )
                          .toISOString()
                          .slice(0, 19)
                      : ""
                  }
                  onChange={(event) => {
                    const input = event.target.value;
                    updateRow({
                      ...filter,
                      value: input ? new Date(input) : undefined,
                    });
                  }}
                />
              )}
              {(filter.type === "booleanObject" ||
                filter.type === "boolean") && (
                <SelectInput
                  aria-label="Value"
                  placeholder="Value"
                  value={
                    typeof filter.value === "boolean"
                      ? String(filter.value)
                      : ""
                  }
                  openState={pickerState("value").openState}
                  options={[
                    { value: "true", label: "true" },
                    { value: "false", label: "false" },
                  ]}
                  noCapture
                  onValueChange={(value) =>
                    updateRow({ ...filter, value: value === "true" })
                  }
                />
              )}
              {valueOptions && (
                <MultiSelectInput
                  {...pickerState("value")}
                  aria-label="Values"
                  placeholder="Value"
                  searchPlaceholder="Search values"
                  emptyMessage={
                    column && loadingColumnIds.includes(column.id)
                      ? "Loading values…"
                      : "No values found."
                  }
                  options={valueOptions}
                  getAdditionalOption={
                    column &&
                    (column.type === "stringOptions" ||
                      column.type === "arrayOptions") &&
                    column.allowCustomValues
                      ? ({ query }) =>
                          query
                            ? {
                                value: query,
                                label: query,
                                secondaryLabel: "Add value",
                              }
                            : undefined
                      : undefined
                  }
                  value={Array.isArray(filter.value) ? filter.value : []}
                  selectedLabel={
                    Array.isArray(filter.value) ? filter.value.join(", ") : ""
                  }
                  onValueChange={(value) => updateRow({ ...filter, value })}
                />
              )}
              <button
                type="button"
                aria-label={`Remove filter ${index + 1}`}
                className="hover:bg-accent focus-visible:ring-ring grid size-8 shrink-0 cursor-pointer place-items-center rounded-sm focus-visible:ring-2"
                onClick={() => {
                  if (picker) setPicker(null);
                  updateDraft(
                    draft.filter((_, rowIndex) => rowIndex !== index),
                    { type: "remove" },
                  );
                }}
              >
                <X size="base" color="default" />
              </button>
            </div>
            {notice && (
              <Banner variant={notice.severity}>{notice.message}</Banner>
            )}
          </Fragment>
        );
      })}
      <div className="border-t pt-2">
        <button
          type="button"
          className="hover:bg-accent focus-visible:ring-ring flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-sm focus-visible:ring-2"
          onClick={() => updateDraft([...draft, {}], { type: "add" })}
        >
          <Plus size="base" color="default" />
          Add filter
        </button>
      </div>
    </fieldset>
  );
}
