import {
  compileMultiQueryFormula,
  type MultiQueryTab,
} from "@langfuse/shared/dashboards";
import { type ResolvedReadPath } from "@/src/features/events/hooks/useReadPath";
import { createMultiQueryConfig } from "./multiQueryModel";
import { multiQueryMetricUnit, multiQueryTabUnits } from "./multiQueryFormulas";

export function nextEditorId(prefix: string, existing: { id: string }[]) {
  let index = 1;
  while (existing.some((item) => item.id === prefix + index)) index++;
  return prefix + index;
}

export function createEditorTab(id: string, label: string): MultiQueryTab {
  const { queries, display } = createMultiQueryConfig();
  return { id, label, queries, display, formulas: [] };
}

export function unitName(unit: string) {
  return (
    {
      USD: "US dollars",
      milliseconds: "Duration",
      integer: "Count",
      number: "Number",
      percent: "Percentage",
      "tokens/s": "Tokens per second",
    }[unit] ?? unit.charAt(0).toUpperCase() + unit.slice(1)
  );
}

export function incompatibleTabUnits(
  tab: MultiQueryTab,
  readPath: ResolvedReadPath,
) {
  if (tab.display.chartType === "PIVOT_TABLE") return [];
  const units = [
    ...new Set([...multiQueryTabUnits(tab, readPath).values()].flat()),
  ];
  return units.length > 1 ? units : [];
}

/** Keep complete source definitions for sorting and per-metric formula references. */
export function splitMultiQueryTabByUnit(
  tab: MultiQueryTab,
  movedUnit: string,
  readPath: ResolvedReadPath,
  newId: string,
): [MultiQueryTab, MultiQueryTab] {
  const outputUnits = multiQueryTabUnits(tab, readPath);
  const partition = (moving: boolean): MultiQueryTab => {
    const formulas = (tab.formulas ?? []).filter(
      (formula) =>
        (!formula.hidden && outputUnits.get(formula.id)?.[0] === movedUnit) ===
        moving,
    );
    const dependencies = new Set(
      formulas.flatMap((formula) =>
        compileMultiQueryFormula(formula.expression).references.map(
          (ref) => ref.split(".")[0],
        ),
      ),
    );
    const queries = tab.queries.flatMap((source) => {
      const metrics = source.metrics.map((metric) => {
        const unit = multiQueryMetricUnit(source, metric, readPath) ?? "number";
        const visible =
          !source.hidden && !metric.hidden && (unit === movedUnit) === moving;
        return { ...metric, hidden: !visible || undefined };
      });
      const visible = metrics.some((metric) => !metric.hidden);
      if (
        !visible &&
        !dependencies.has(source.id) &&
        (moving ||
          (!source.hidden && source.metrics.some((metric) => !metric.hidden)))
      )
        return [];
      return [{ ...source, metrics, hidden: !visible || undefined }];
    });
    return {
      ...tab,
      id: moving ? newId : tab.id,
      label: moving ? unitName(movedUnit) : tab.label,
      queries,
      formulas,
    };
  };
  return [partition(false), partition(true)];
}
