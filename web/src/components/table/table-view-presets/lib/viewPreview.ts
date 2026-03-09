import { type FilterState, type TableViewPresetDomain } from "@langfuse/shared";

const MAX_FILTERS_IN_PREVIEW = 2;
const MAX_VALUES_IN_FILTER_PREVIEW = 2;

function formatFilterLabel(filter: FilterState[number]) {
  return "key" in filter && filter.key
    ? `${filter.column}.${filter.key}`
    : filter.column;
}

function formatArrayFilterValue(values: string[]) {
  const previewValues = values
    .slice(0, MAX_VALUES_IN_FILTER_PREVIEW)
    .join(", ");
  const hiddenValueCount = values.length - MAX_VALUES_IN_FILTER_PREVIEW;

  return hiddenValueCount > 0
    ? `${previewValues} +${hiddenValueCount}`
    : previewValues;
}

function formatFilterValue(filter: FilterState[number]) {
  if (filter.type === "null") return "";

  if (filter.type === "positionInTrace") {
    return filter.value ? `${filter.key} ${filter.value}` : filter.key;
  }

  if (filter.type === "datetime") {
    return filter.value.toISOString().slice(0, 10);
  }

  if (Array.isArray(filter.value)) {
    return formatArrayFilterValue(filter.value);
  }

  return String(filter.value);
}

export function formatFilterPreview(filter: FilterState[number]) {
  const label = formatFilterLabel(filter);

  if (filter.type === "null") {
    return `${label} ${filter.operator}`;
  }

  return `${label} ${filter.operator} ${formatFilterValue(filter)}`;
}

export function summarizeTableViewPreset(
  view: Pick<
    TableViewPresetDomain,
    "filters" | "searchQuery" | "orderBy" | "columnVisibility" | "columnOrder"
  >,
) {
  const previewParts = view.filters
    .slice(0, MAX_FILTERS_IN_PREVIEW)
    .map(formatFilterPreview);

  const hiddenFilterCount = view.filters.length - MAX_FILTERS_IN_PREVIEW;
  if (hiddenFilterCount > 0) {
    previewParts.push(`+${hiddenFilterCount} more filters`);
  }

  if (previewParts.length < 2 && view.searchQuery?.trim()) {
    previewParts.push(`Search "${view.searchQuery.trim()}"`);
  }

  if (previewParts.length < 2 && view.orderBy?.column) {
    previewParts.push(`Sort ${view.orderBy.column} ${view.orderBy.order}`);
  }

  if (
    previewParts.length === 0 &&
    (view.columnOrder.length > 0 ||
      Object.keys(view.columnVisibility).length > 0)
  ) {
    previewParts.push("Saved column layout");
  }

  return previewParts.join(" · ");
}
