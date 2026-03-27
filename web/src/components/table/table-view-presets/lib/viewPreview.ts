import { type FilterState, type TableViewPresetState } from "@langfuse/shared";

function formatFilterLabel(filter: FilterState[number]) {
  return "key" in filter && filter.key
    ? `${filter.column}.${filter.key}`
    : filter.column;
}

function formatFilterValue(filter: FilterState[number]) {
  if (filter.type === "null") return "";

  if (filter.type === "positionInTrace") {
    if (filter.key === "first" || filter.key === "root") return "1st";
    return filter.value ? `${filter.key} ${filter.value}` : filter.key;
  }

  if (filter.type === "datetime") {
    const dateValue =
      filter.value instanceof Date ? filter.value : new Date(filter.value);

    return Number.isNaN(dateValue.getTime())
      ? String(filter.value)
      : dateValue.toISOString().slice(0, 10);
  }

  if (Array.isArray(filter.value)) {
    return filter.value.join(", ");
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

export function summarizeTableViewPreset(view: TableViewPresetState) {
  const previewParts = view.filters.map(formatFilterPreview);

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
