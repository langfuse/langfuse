import { useState } from "react";
import {
  type MultiQueryFormula,
  type MultiQueryTab,
} from "@langfuse/shared/dashboards";
import { BracesIcon, PlusIcon } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { SelectInput } from "@/src/components/design-system/SelectInput/SelectInput";
import { Input } from "@/src/components/design-system/Input/Input";
import { MultiQuerySourceEditor } from "./MultiQuerySourceEditor";
import { MultiQueryFormulaEditor } from "./MultiQueryFormulaEditor";
import { createMultiQueryTab, multiQueryMetricLabel } from "./multiQueryModel";
import { isTimeSeriesChart } from "@/src/features/widgets/chart-library/utils";
import { nextEditorId } from "./multiQueryTabEditing";
import { type MultiQueryWidgetContext } from "./useMultiQueryWidget";

export function MultiQueryTabSources({
  tab,
  context,
  onChange,
  invalidSources,
  formulaErrors,
  onInvalidChange,
  track,
}: {
  tab: MultiQueryTab;
  context: MultiQueryWidgetContext;
  onChange: (tab: MultiQueryTab) => void;
  invalidSources: ReadonlySet<string>;
  formulaErrors: ReadonlyMap<MultiQueryFormula, string>;
  onInvalidChange: (id: string, invalid: boolean) => void;
  track: (action: string, count?: number) => void;
}) {
  const [expanded, setExpanded] = useState(
    tab.queries.length === 1 ? tab.queries[0]!.id : "",
  );
  const formulas = tab.formulas ?? [];
  const ids = [...tab.queries, ...formulas];
  const addSource = (source?: MultiQueryTab["queries"][number]) => {
    const id = nextEditorId("series_", ids);
    const query = source
      ? {
          ...structuredClone(source),
          id,
          label: (source.label + " copy").slice(0, 200),
        }
      : {
          ...createMultiQueryTab().queries[0]!,
          id,
          label: "Series " + String.fromCharCode(65 + tab.queries.length),
        };
    onChange({ ...tab, queries: [...tab.queries, query] });
    setExpanded(id);
    track(
      source ? "multi_query_series_duplicated" : "multi_query_series_added",
      tab.queries.length + 1,
    );
  };
  const addFormula = () => {
    const id = nextEditorId("formula_", ids);
    onChange({
      ...tab,
      formulas: [
        ...formulas,
        {
          id,
          label: "",
          expression: "",
          format: "number",
        },
      ],
    });
    setExpanded("");
    requestAnimationFrame(() =>
      document.getElementById(tab.id + "-" + id)?.focus(),
    );
    track("multi_query_formula_added", formulas.length + 1);
  };
  const display = (next: Partial<MultiQueryTab["display"]>) =>
    onChange({ ...tab, display: { ...tab.display, ...next } });
  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <h3 className="mr-auto text-sm font-bold">Series</h3>
        <Button
          text="Add series"
          size="sm"
          variant="ghost"
          icon={PlusIcon}
          disabled={tab.queries.length >= 5}
          onClick={() => addSource()}
        />
        <Button
          text="Add formula"
          size="sm"
          variant="ghost"
          icon={BracesIcon}
          disabled={formulas.length >= 5}
          onClick={addFormula}
        />
      </div>
      {tab.queries.map((source, index) => (
        <MultiQuerySourceEditor
          key={source.id}
          source={source}
          index={index}
          context={context}
          expanded={expanded === source.id}
          hasInvalidFilters={invalidSources.has(source.id)}
          onHasInvalidFiltersChange={(invalid) =>
            onInvalidChange(source.id, invalid)
          }
          onExpandedChange={() =>
            setExpanded(expanded === source.id ? "" : source.id)
          }
          onChange={(next) =>
            onChange({
              ...tab,
              queries: tab.queries.map((q) => (q.id === source.id ? next : q)),
            })
          }
          onDuplicate={
            tab.queries.length < 5 && !invalidSources.has(source.id)
              ? () => addSource(source)
              : undefined
          }
          onRemove={
            tab.queries.length > 1
              ? () => {
                  onInvalidChange(source.id, false);
                  onChange({
                    ...tab,
                    queries: tab.queries.filter((q) => q.id !== source.id),
                  });
                  track("multi_query_series_removed", tab.queries.length - 1);
                }
              : undefined
          }
        />
      ))}
      {formulas.map((formula) => (
        <MultiQueryFormulaEditor
          key={formula.id}
          tab={tab}
          formula={formula}
          validationMessage={formulaErrors.get(formula)}
          track={track}
          onChange={(next) =>
            onChange({
              ...tab,
              formulas: formulas.map((f) => (f.id === formula.id ? next : f)),
            })
          }
          onRemove={() => {
            onChange({
              ...tab,
              formulas: formulas.filter((f) => f.id !== formula.id),
            });
            track("multi_query_formula_removed", formulas.length - 1);
          }}
          onPlotOnly={() => {
            onChange({
              ...tab,
              queries: tab.queries.map((q) => ({ ...q, hidden: true })),
              formulas: formulas.map((f) => ({
                ...f,
                hidden: f.id !== formula.id || undefined,
              })),
            });
            track("multi_query_formula_solo");
          }}
        />
      ))}
      <details className="mt-1 text-xs">
        <summary className="text-muted-foreground cursor-pointer font-medium">
          Display options
        </summary>
        <div className="flex flex-col gap-3 pt-3">
          {isTimeSeriesChart(tab.display.chartType) && (
            <label className="flex flex-col gap-1">
              Time interval
              <SelectInput
                aria-label="Time interval"
                placeholder="Choose interval"
                value={tab.display.timeBuckets ?? "auto"}
                options={[
                  { value: "auto", label: "Automatic" },
                  { value: "dashboard", label: "Match Home dashboard" },
                ]}
                onValueChange={(value) => {
                  display({
                    timeBuckets: value === "dashboard" ? "dashboard" : "auto",
                  });
                  track("multi_query_time_interval_changed");
                }}
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            Subtotal
            <SelectInput
              aria-label="Subtotal"
              placeholder="Choose metric"
              value={tab.display.subtotalMetric ?? "none"}
              options={[
                { value: "none", label: "None" },
                ...tab.queries.flatMap((source) =>
                  source.metrics
                    .filter((metric) =>
                      ["count", "sum", "uniq"].includes(metric.aggregation),
                    )
                    .map((metric) => ({
                      value: source.id + "." + metric.id,
                      label:
                        source.label + " · " + multiQueryMetricLabel(metric),
                    })),
                ),
              ]}
              onValueChange={(value) => {
                display({
                  subtotalMetric: value === "none" ? undefined : value,
                });
                track("multi_query_subtotal_changed");
              }}
            />
          </label>
          {tab.display.chartType === "PIVOT_TABLE" && (
            <label className="flex flex-col gap-1">
              Missing breakdown values
              <SelectInput
                aria-label="Missing breakdown values"
                placeholder="Choose visibility"
                value={tab.display.hideUnattributedRows ? "hide" : "show"}
                options={[
                  { value: "show", label: "Show as Unknown" },
                  { value: "hide", label: "Hide rows" },
                ]}
                onValueChange={(value) => {
                  display({ hideUnattributedRows: value === "hide" });
                  track("multi_query_missing_groups_changed");
                }}
              />
            </label>
          )}
          <label className="flex items-center justify-between gap-2">
            Rows per series
            <Input
              aria-label="Rows per series"
              type="number"
              min={1}
              max={1000}
              value={tab.display.rowLimit ?? 100}
              onChange={(e) => display({ rowLimit: Number(e.target.value) })}
            />
          </label>
          {tab.display.chartType === "HISTOGRAM" && (
            <label className="flex items-center justify-between gap-2">
              Histogram bins
              <Input
                aria-label="Histogram bins"
                type="number"
                min={1}
                max={100}
                value={tab.display.bins ?? 10}
                onChange={(e) => display({ bins: Number(e.target.value) })}
              />
            </label>
          )}
          <SelectInput
            aria-label="Legend"
            placeholder="Show legend"
            value={tab.display.legend === false ? "hidden" : "visible"}
            options={[
              { value: "visible", label: "Show legend" },
              { value: "hidden", label: "Hide legend" },
            ]}
            onValueChange={(value) => {
              display({ legend: value === "visible" });
              track("multi_query_legend_visibility_changed");
            }}
          />
        </div>
      </details>
    </>
  );
}
