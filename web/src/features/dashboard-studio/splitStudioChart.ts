import { type StudioWidgetConfig, type StudioSeries } from "@langfuse/shared";
import { studioFormulaReferences } from "@/src/features/dashboard/lib/studioExpressions";

/** Keep stable formula operands inside each tab even when a dependency is plotted in the other. */
export function splitStudioChart(
  chart: StudioWidgetConfig,
  unit: string,
  visible: StudioSeries[],
) {
  const key = (series: StudioSeries) =>
    chart.expressions.some((item) => item.id === series.queryId)
      ? series.queryId
      : series.queryId + "." + series.metricId;
  const moved = new Set(
    visible.filter((s) => (s.unit ?? "number") === unit).map(key),
  );
  const keep = new Set(
    visible.filter((s) => (s.unit ?? "number") !== unit).map(key),
  );
  if (!moved.size || !keep.size) return undefined;
  function part(outputs: Set<string>, original: boolean): StudioWidgetConfig {
    const needed = new Set(outputs);
    if (original) {
      for (const query of chart.queries)
        for (const metric of query.metrics) {
          const id = query.id + "." + metric.id;
          if (!moved.has(id)) needed.add(id);
        }
      for (const exp of chart.expressions)
        if (!moved.has(exp.id)) needed.add(exp.id);
    }
    for (const expr of [...chart.expressions].reverse()) {
      if (needed.has(expr.id))
        for (const ref of studioFormulaReferences(expr.formula))
          needed.add(ref);
    }
    const queries = chart.queries.flatMap((q) => {
      const metrics = q.metrics
        .filter((m) => needed.has(q.id + "." + m.id))
        .map((m) => {
          const id = q.id + "." + m.id;
          return {
            ...m,
            hidden:
              outputs.has(id) || (original && !moved.has(id)) ? m.hidden : true,
          };
        });
      return metrics.length ? [{ ...q, metrics }] : [];
    });
    // A literal formula still needs a source defining its time buckets.
    if (!queries.length)
      queries.push({
        ...chart.queries[0]!,
        metrics: chart.queries[0]!.metrics.map((m) => ({ ...m, hidden: true })),
      });
    const expressions = chart.expressions
      .filter((e) => needed.has(e.id))
      .map((e) => ({
        ...e,
        hidden:
          outputs.has(e.id) || (original && !moved.has(e.id)) ? e.hidden : true,
      }));
    const ref = chart.display.headlineMetricRef;
    return {
      ...chart,
      queries,
      expressions,
      display: {
        ...chart.display,
        headlineMetricRef: ref && outputs.has(ref) ? ref : undefined,
      },
    };
  }
  return {
    remaining: part(keep, true),
    moved: {
      ...part(moved, false),
      title: visible
        .find((s) => (s.unit ?? "number") === unit)!
        .label.slice(0, 200),
    },
  };
}
