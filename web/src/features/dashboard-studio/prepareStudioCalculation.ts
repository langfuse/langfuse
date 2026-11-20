import {
  type StudioResult,
  type StudioRow,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import { studioFormulaReferences } from "../dashboard/lib/studioExpressions";
import { readableField } from "./catalog";
import {
  createStudioFormulaOperands,
  displayStudioFormula,
} from "./studioFormulaAuthoring";

const pointKey = (row: StudioRow) =>
  JSON.stringify([
    row.time,
    Object.entries(row.dimensions).sort(([a], [b]) => a.localeCompare(b)),
  ]);

function pointLabel(row: StudioRow) {
  const dimensions = Object.entries(row.dimensions)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([field, value]) =>
        `${readableField(field)}: ${value === "" ? "Empty string" : (value ?? "No value")}`,
    );
  return [row.time ?? "Full returned period", ...dimensions].join(" · ");
}

/** Reads one exact returned calculation context; absent operands remain absent. */
export function prepareStudioCalculation(
  config: StudioWidgetConfig,
  result: StudioResult,
  expressionId?: string,
  selectedPoint?: string,
) {
  const expression =
    config.expressions.find((item) => item.id === expressionId) ??
    config.expressions.find((item) => !item.hidden) ??
    config.expressions[0];
  if (!expression) return null;
  const operands = createStudioFormulaOperands(
    config.queries,
    config.expressions,
    true,
  );
  const expressions = new Map(
    config.expressions.map((item) => [item.id, item]),
  );
  const referenceOf = (row: Pick<StudioRow, "queryId" | "metricId">) =>
    expressions.has(row.queryId)
      ? row.queryId
      : `${row.queryId}.${row.metricId}`;
  const references = studioFormulaReferences(expression.formula);
  const relevant = new Set([...references, expression.id]);
  const candidates = result.rows.filter((row) =>
    relevant.has(referenceOf(row)),
  );
  const summaryCandidates = result.summaries.filter((row) =>
    relevant.has(referenceOf(row)),
  );
  const useSummaries =
    (config.display.chartType === "NUMBER" &&
      summaryCandidates.some((row) => referenceOf(row) === expression.id)) ||
    !candidates.length;
  const rows = useSummaries ? summaryCandidates : candidates;
  const computedRows = rows.filter((row) => referenceOf(row) === expression.id);
  const contexts = [
    ...new Map(
      (computedRows.length ? computedRows : rows).map((row) => [
        pointKey(row),
        row,
      ]),
    ).entries(),
  ].sort(([a, left], [b, right]) => {
    if (left.time !== right.time)
      return (right.time ?? "").localeCompare(left.time ?? "");
    return a.localeCompare(b);
  });
  const selected =
    contexts.find(([key]) => key === selectedPoint) ??
    contexts.find(([, row]) => row.value !== null) ??
    contexts[0];
  const points = contexts.map(([value, row]) => ({
    value,
    label: pointLabel(row),
  }));
  const contextRows = selected
    ? rows.filter((row) => pointKey(row) === selected[0])
    : [];
  const byReference = new Map(
    contextRows.map((row) => [referenceOf(row), row]),
  );
  const describe = (reference: string, computed: boolean) => {
    const operand = operands.find((item) => item.reference === reference);
    const row = byReference.get(reference);
    const descriptor =
      result.series.find((series) => series.id === row?.seriesId) ??
      result.series.find((series) => referenceOf(series) === reference);
    const configuredExpression = expressions.get(reference);
    return {
      reference,
      token: operand?.token ?? reference,
      label: operand?.label ?? configuredExpression?.label ?? reference,
      value: row?.value,
      unit:
        configuredExpression?.unit ?? descriptor?.rawUnit ?? descriptor?.unit,
      computed,
      hidden: operand?.hidden ?? false,
    };
  };
  return {
    expression,
    formula: displayStudioFormula(expression.formula, operands),
    expressionOptions: config.expressions.map((item) => ({
      value: item.id,
      label: item.label || item.id,
    })),
    point: selected
      ? {
          value: selected[0],
          label: pointLabel(selected[1]),
          time: selected[1].time,
          dimensions: selected[1].dimensions,
        }
      : null,
    points,
    terms: [
      ...references.map((reference) => describe(reference, false)),
      describe(expression.id, true),
    ],
    scope: useSummaries ? ("summaries" as const) : ("rows" as const),
  };
}
