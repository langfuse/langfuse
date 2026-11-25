import {
  type MultiQueryConfig,
  type MultiQueryTab,
} from "@langfuse/shared/dashboards";
import { type DataTableProps } from "@/src/components/design-system/charts/internal/VisualizationFrame/VisualizationFrame";
import { toFullMetricString } from "@/src/features/widgets/chart-library/utils";
import {
  multiQueryMetricLabel,
  readableMultiQueryField,
  type MultiQueryValue,
} from "./multiQueryModel";
import { multiQueryFormatter } from "./multiQueryPresentation";

export function returnedRowsSubtotal(
  queries: MultiQueryConfig["queries"],
  ref: string | undefined,
  values: MultiQueryValue[],
) {
  if (!ref) return;
  const [queryId, metricId] = ref.split(".");
  const metric = queries
    .find((query) => query.id === queryId)
    ?.metrics.find((m) => m.id === metricId);
  if (!metric || !["count", "sum", "uniq"].includes(metric.aggregation)) return;
  let total: number | undefined;
  let unit: string | undefined;
  for (const row of values) {
    if (
      row.queryId !== queryId ||
      row.metricId !== metricId ||
      row.value === null
    )
      continue;
    total = (total ?? 0) + row.value;
    unit = row.unit;
  }
  if (total === undefined) return;
  return { value: total, unit, label: multiQueryMetricLabel(metric) };
}

/** Independent metrics can share a table row only when their breakdown fields match. */
export function groupedMetricTable(
  values: MultiQueryValue[],
  hideUnattributedRows = false,
  complete?: { queries: MultiQueryTab["queries"]; rowLimit: number },
): DataTableProps | undefined {
  const first = values[0];
  if (!first) return;
  const dimensions = Object.keys(first.dimensions);
  if (!dimensions.length) return;
  const metricColumns = new Map<string, DataTableProps["columns"][number]>();
  const returnedCounts = new Map<string, number>();
  const rows = new Map<
    string,
    Map<string, DataTableProps["rows"][number]["cells"][number]>
  >();
  const multipleSources = values.some(
    (value) => value.queryId !== first.queryId,
  );
  for (const item of values) {
    if (
      item.bin ||
      item.time ||
      Object.keys(item.dimensions).length !== dimensions.length ||
      !dimensions.every((field) => Object.hasOwn(item.dimensions, field))
    )
      return;
    const columnId = item.queryId + "." + item.metricId;
    returnedCounts.set(columnId, (returnedCounts.get(columnId) ?? 0) + 1);
    if (!metricColumns.has(columnId)) {
      const label =
        multipleSources && item.metricLabel !== item.queryLabel
          ? item.queryLabel + " · " + item.metricLabel
          : item.metricLabel;
      metricColumns.set(columnId, { id: columnId, label, align: "right" });
    }
    const group = dimensions.map((field) => item.dimensions[field] ?? null);
    if (hideUnattributedRows && group.includes(null)) continue;
    const key = JSON.stringify(group);
    let cells = rows.get(key);
    if (!cells) {
      cells = new Map(
        dimensions.map((field, i) => [
          field,
          { columnId: field, value: group[i] ?? "Unknown" },
        ]),
      );
      rows.set(key, cells);
    }
    // A finer-grained source must stay in the detailed table, where both values survive.
    if (cells.has(columnId)) return;
    cells.set(columnId, {
      columnId,
      value:
        item.value === null
          ? "—"
          : toFullMetricString(
              multiQueryFormatter(item.unit)(item.value, { style: "full" }),
            ),
    });
  }
  const emptyCounts = new Set<string>();
  for (const query of complete?.queries ?? []) {
    if (
      query.hidden ||
      query.dimensions.length !== dimensions.length ||
      !query.dimensions.every(({ field }) => dimensions.includes(field))
    )
      continue;
    for (const metric of query.metrics) {
      if (
        metric.hidden ||
        metric.measure !== "count" ||
        !["count", "sum"].includes(metric.aggregation)
      )
        continue;
      const columnId = query.id + "." + metric.id;
      if (!metricColumns.has(columnId))
        metricColumns.set(columnId, {
          id: columnId,
          label: metric.label ?? query.label,
          align: "right",
        });
      // A bounded result may omit a group with a nonzero count.
      if ((returnedCounts.get(columnId) ?? 0) < complete!.rowLimit)
        emptyCounts.add(columnId);
    }
  }
  const columns = [
    ...dimensions.map((field) => ({
      id: field,
      label: readableMultiQueryField(field),
    })),
    ...metricColumns.values(),
  ];
  return {
    columns,
    rows: [...rows].map(([id, cells]) => ({
      id,
      cells: columns.map(
        ({ id: columnId }) =>
          cells.get(columnId) ?? {
            columnId,
            value: emptyCounts.has(columnId) ? 0 : "—",
          },
      ),
    })),
  };
}
