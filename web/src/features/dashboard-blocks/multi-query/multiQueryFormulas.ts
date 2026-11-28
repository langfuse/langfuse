import {
  compileMultiQueryFormula,
  getWidgetQueryView,
  type MultiQueryTab,
} from "@langfuse/shared/dashboards";
import {
  getResultUnit,
  resolveWidgetRenderVersion,
} from "@langfuse/shared/query";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import {
  seriesColor,
  seriesFillColor,
} from "@/src/features/widgets/chart-library/seriesColors";
import {
  type MultiQueryValue,
  type normalizeMultiQueryResults,
} from "./multiQueryModel";

import { formatMultiQueryFormula } from "./formulaOperands";

type TabQuery = MultiQueryTab["queries"][number];
type Result = ReturnType<typeof normalizeMultiQueryResults>;

export function multiQueryMetricUnit(
  source: TabQuery,
  metric: TabQuery["metrics"][number],
  readPath: ResolvedReadPath,
) {
  const version = resolveWidgetRenderVersion({
    newestReadableVersion: readPath === "v4" ? "v2" : "v1",
    shape: {
      view: getWidgetQueryView(source.view),
      measures: source.metrics,
      dimensions: source.dimensions,
      filters: source.filters,
    },
  });
  return metric.aggregation === "histogram"
    ? "integer"
    : getResultUnit(
        getWidgetQueryView(source.view),
        metric.measure,
        metric.aggregation,
        version,
      );
}

/** Unit groups use every configured visible metric, including a series with no returned observations. */
export function multiQueryTabUnits(
  tab: MultiQueryTab,
  readPath: ResolvedReadPath,
) {
  const cells = new Map<string, { value: number; unit?: string }>();
  const groups = new Map<string, string[]>();
  for (const query of tab.queries) {
    const units = new Set<string>();
    for (const metric of query.metrics) {
      const unit = multiQueryMetricUnit(query, metric, readPath);
      cells.set(`${query.id}.${metric.id}`, { value: 1, unit });
      if (!query.hidden && !metric.hidden) units.add(unit ?? "number");
    }
    if (units.size) groups.set(query.id, [...units]);
  }
  for (const formula of tab.formulas ?? []) {
    if (formula.hidden) continue;
    try {
      const { unit } = compileMultiQueryFormula(formula.expression).evaluate(
        cells,
      );
      groups.set(formula.id, [
        formula.format === "percent" ? "percent" : (unit ?? "number"),
      ]);
    } catch {
      // Incomplete formula drafts are validated alongside their input.
    }
  }
  return groups;
}

export function applyMultiQueryFormulas(
  tab: MultiQueryTab,
  result: Result,
  readPath: ResolvedReadPath = "v4",
): Result {
  if (
    !tab.formulas?.length &&
    !tab.queries.some((q) => q.hidden || q.metrics.some((m) => m.hidden))
  )
    return result;
  const hiddenRefs = new Set(
    tab.queries.flatMap((q) =>
      q.metrics
        .filter((m) => q.hidden || m.hidden)
        .map((m) => `${q.id}.${m.id}`),
    ),
  );
  const series = result.series.filter(
    (s) => !hiddenRefs.has(s.id.split(":")[0]!),
  );
  const values = result.values.filter(
    (v) => !hiddenRefs.has(`${v.queryId}.${v.metricId}`),
  );
  const failures = [...result.failures];
  const units = new Map<string, string | undefined>();
  for (const source of tab.queries) {
    for (const metric of source.metrics) {
      units.set(
        `${source.id}.${metric.id}`,
        multiQueryMetricUnit(source, metric, readPath),
      );
    }
  }
  let nextColor = result.series.length;
  for (const formula of tab.formulas ?? []) {
    if (formula.hidden) continue;
    const label =
      formula.label.trim() ||
      formatMultiQueryFormula(tab, formula.expression).trim();
    try {
      const compiled = compileMultiQueryFormula(formula.expression);
      const wanted = new Set(compiled.references);
      const cells = new Map<
        string,
        {
          sample: MultiQueryValue;
          inputs: Map<string, { value: number | null; unit?: string }>;
        }
      >();
      for (const row of result.values) {
        const ref = `${row.queryId}.${row.metricId}`;
        if (!wanted.has(ref)) continue;
        const dims = Object.entries(row.dimensions).sort(([a], [b]) =>
          a.localeCompare(b),
        );
        const key = JSON.stringify([row.time, dims]);
        let cell = cells.get(key);
        if (!cell) {
          cell = { sample: row, inputs: new Map() };
          cells.set(key, cell);
        }
        cell.inputs.set(ref, { value: row.value, unit: row.unit });
      }
      if (cells.size + values.length > 100_000)
        throw new Error(
          "The formula returned too many values. Narrow the time range or breakdown.",
        );
      const lines = new Set<string>();
      for (const { sample, inputs } of cells.values()) {
        for (const ref of wanted) {
          if (!inputs.has(ref))
            inputs.set(ref, { value: null, unit: units.get(ref) });
        }
        const cell = compiled.evaluate(inputs);
        const group = Object.entries(sample.dimensions).sort(([a], [b]) =>
          a.localeCompare(b),
        );
        const id = `formula:${formula.id}${group.length ? ":" + JSON.stringify(group) : ""}`;
        const unit = formula.format === "percent" ? "percent" : cell.unit;
        if (!lines.has(id)) {
          const colorIndex = nextColor++;
          lines.add(id);
          series.push({
            id,
            label: [
              label,
              ...group.map(([, value]) => value ?? "Unknown"),
            ].join(" · "),
            unit,
            aggregation: "formula",
            color: seriesColor(colorIndex),
            fillColor: seriesFillColor(colorIndex),
          });
        }
        const value =
          formula.format === "percent" && cell.value !== null
            ? cell.value * 100
            : cell.value;
        values.push({
          seriesId: id,
          queryId: formula.id,
          metricId: formula.id,
          queryLabel: label,
          metricLabel: label,
          time: sample.time,
          dimensions: sample.dimensions,
          value: value !== null && Number.isFinite(value) ? value : null,
          unit,
        });
      }
    } catch (error) {
      failures.push({
        id: formula.id,
        label,
        message: error instanceof Error ? error.message : "Invalid formula",
      });
    }
  }
  let status = result.status;
  if (failures.length > result.failures.length)
    status = values.length ? "partial" : "error";
  return {
    ...result,
    series,
    values,
    failures,
    status,
  };
}
