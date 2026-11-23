import {
  type StudioMetric,
  type StudioQuery,
  type StudioWidgetConfig,
} from "@langfuse/shared";
import { getResultUnit } from "@langfuse/shared/query";
import {
  evaluateStudioFormula,
  studioFormulaReferences,
} from "../dashboard/lib/studioExpressions";
import { getStudioSource, readableField } from "./catalog";

export type StudioFormulaOperand = {
  reference: string;
  token: string;
  queryLetter: string;
  label: string;
  unit?: string;
  hidden: boolean;
};

export const studioSeriesLetter = (index: number) =>
  String.fromCharCode(65 + index);

export type StudioSeriesVisibility = {
  queries: Pick<StudioQuery, "id" | "hidden">[];
  expressions: Pick<
    StudioWidgetConfig["expressions"][number],
    "id" | "hidden"
  >[];
  hiddenSeriesIds: string[] | undefined;
};

export function getStudioSeriesVisibility(
  config: StudioWidgetConfig,
): StudioSeriesVisibility {
  return {
    queries: config.queries.map(({ id, hidden }) => ({ id, hidden })),
    expressions: config.expressions.map(({ id, hidden }) => ({ id, hidden })),
    hiddenSeriesIds: config.display.hiddenSeriesIds,
  };
}

export function getStudioFormulaOnlyVisibility(
  config: StudioWidgetConfig,
  expressionId: string,
): StudioSeriesVisibility {
  return {
    queries: config.queries.map(({ id }) => ({ id, hidden: true })),
    expressions: config.expressions.map(({ id }) => ({
      id,
      hidden: id !== expressionId,
    })),
    hiddenSeriesIds: config.display.hiddenSeriesIds?.filter(
      (id) => id !== expressionId && !id.startsWith(`${expressionId}:`),
    ),
  };
}

/** Only known visibility entries are restored; newly added series retain their current choices. */
export function applyStudioSeriesVisibility(
  config: StudioWidgetConfig,
  visibility: StudioSeriesVisibility,
): StudioWidgetConfig {
  const queries = new Map(
    visibility.queries.map((item) => [item.id, item.hidden]),
  );
  const expressions = new Map(
    visibility.expressions.map((item) => [item.id, item.hidden]),
  );
  const known = [...queries.keys(), ...expressions.keys()];
  const preservedIds =
    config.display.hiddenSeriesIds?.filter(
      (seriesId) =>
        !known.some(
          (id) =>
            seriesId === id ||
            seriesId.startsWith(`${id}.`) ||
            seriesId.startsWith(`${id}:`),
        ),
    ) ?? [];
  const hiddenSeriesIds =
    visibility.hiddenSeriesIds || preservedIds.length
      ? [...new Set([...(visibility.hiddenSeriesIds ?? []), ...preservedIds])]
      : undefined;
  return {
    ...config,
    queries: config.queries.map((query) =>
      queries.has(query.id)
        ? { ...query, hidden: queries.get(query.id) }
        : query,
    ),
    expressions: config.expressions.map((expression) =>
      expressions.has(expression.id)
        ? { ...expression, hidden: expressions.get(expression.id) }
        : expression,
    ),
    display: { ...config.display, hiddenSeriesIds },
  };
}

export function studioMetricCaption(metric: StudioMetric): string {
  const field = readableField(metric.measure).toLowerCase();
  if (
    metric.measure === "count" &&
    (metric.aggregation === "count" || metric.aggregation === "sum")
  )
    return "Count";
  if (metric.aggregation.startsWith("p"))
    return `p${metric.percentile ?? metric.aggregation.slice(1)} ${field}`;
  if (metric.aggregation === "sum")
    return field.startsWith("total ")
      ? readableField(metric.measure)
      : `Total ${field}`;
  const prefix: Record<string, string> = {
    avg: "Average",
    min: "Minimum",
    max: "Maximum",
    uniq: "Distinct",
    histogram: "Distribution of",
    count: "Count",
  };
  return `${prefix[metric.aggregation] ?? readableField(metric.aggregation)} ${field}`;
}

export function createStudioFormulaOperands(
  queries: StudioQuery[],
  earlierExpressions: StudioWidgetConfig["expressions"],
  isV4: boolean,
): StudioFormulaOperand[] {
  const operands = queries.flatMap((query, index) => {
    const letter = studioSeriesLetter(index);
    const source = getStudioSource(query.view, isV4);
    return query.metrics.map((metric) => ({
      reference: `${query.id}.${metric.id}`,
      token: query.metrics.length === 1 ? letter : `${letter}.${metric.id}`,
      queryLetter: letter,
      label: `${query.label || query.id} · ${metric.label || studioMetricCaption(metric)}`,
      unit:
        metric.aggregation === "count" && metric.measure === "count"
          ? source.measures.count?.unit
          : getResultUnit(
              query.view,
              metric.measure,
              metric.aggregation,
              isV4 ? "v2" : "v1",
            ),
      hidden: Boolean(query.hidden),
    }));
  });
  for (const expression of earlierExpressions) {
    let unit: string | undefined;
    try {
      unit = evaluateStudioFormula(
        expression.formula,
        new Map(
          operands.map((operand) => [
            operand.reference,
            { value: 1, unit: operand.unit },
          ]),
        ),
      ).unit;
    } catch {
      // Invalid drafts remain editable and receive validation in their own row.
    }
    const letter = studioSeriesLetter(
      queries.length +
        operands.filter((operand) => !operand.reference.includes(".")).length,
    );
    operands.push({
      reference: expression.id,
      token: letter,
      queryLetter: letter,
      label: expression.label || expression.id,
      unit,
      hidden: Boolean(expression.hidden),
    });
  }
  return operands;
}

const referenceTokens =
  /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?/g;

export function displayStudioFormula(
  formula: string,
  operands: StudioFormulaOperand[],
): string {
  const tokens = new Map(
    operands.map((operand) => [operand.reference, operand.token]),
  );
  return formula.replace(
    referenceTokens,
    (token) => tokens.get(token) ?? token,
  );
}

export function lowerStudioFormula(
  formula: string,
  operands: StudioFormulaOperand[],
): string {
  const references = new Map(
    operands.map((operand) => [operand.token, operand.reference]),
  );
  return formula.replace(
    referenceTokens,
    (token) => references.get(token) ?? token,
  );
}

export function studioAuthoringError(
  formula: string,
  operands: StudioFormulaOperand[],
): string | null {
  const references = studioFormulaReferences(formula);
  for (const reference of references) {
    if (operands.some((operand) => operand.reference === reference)) continue;
    const metrics = operands.filter(
      (operand) => operand.queryLetter === reference,
    );
    if (metrics.length > 1)
      return `${reference} has ${metrics.length} metrics. Choose a specific metric, such as ${metrics[0].token}.`;
  }
  try {
    evaluateStudioFormula(
      formula,
      new Map(
        operands.map((operand) => [
          operand.reference,
          { value: 1, unit: operand.unit },
        ]),
      ),
    );
    return references.length
      ? null
      : "Choose a source metric or an earlier computed series.";
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Invalid arithmetic expression";
  }
}
