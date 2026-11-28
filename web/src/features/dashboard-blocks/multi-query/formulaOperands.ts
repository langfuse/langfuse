import { type MultiQueryTab } from "@langfuse/shared/dashboards";
import { multiQueryMetricLabel } from "./multiQueryModel";

// A quoted name stays one operand even if it contains arithmetic or a metric ID.
const tokenPattern =
  /"(?:\\.|[^"\\])*"?|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d*)?|[\p{L}_][\p{L}\p{M}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{M}\p{N}_]*)?|[^\s]/gu;

export function formulaOperands(tab: MultiQueryTab) {
  const operands = tab.queries.flatMap((query, index) =>
    query.metrics.map((metric, metricIndex) => {
      const letter = String.fromCharCode(65 + index);
      const multiple = query.metrics.length > 1;
      const label = multiple ? letter + (metricIndex + 1) : letter;
      const series = query.label.trim() || letter;
      const name = multiple
        ? series + " · " + multiQueryMetricLabel(metric)
        : series;
      return {
        label,
        name,
        reference: query.id + "." + metric.id,
        query,
        metric,
      };
    }),
  );
  const shortcuts = new Set(operands.map((op) => op.label));
  return operands.map((op) => {
    const { name, label } = op;
    // Keep names distinct from numbers, operators and other series' shortcuts.
    const plain =
      /^[\p{L}_][\p{L}\p{M}\p{N}_ ·]*$/u.test(name) &&
      (!shortcuts.has(name) || name === label);
    const disambiguator = operands.some(
      (other) => other !== op && other.name === name,
    )
      ? " [" + label + "]"
      : "";
    return {
      ...op,
      inputText: (plain ? name : JSON.stringify(name)) + disambiguator,
    };
  });
}

/** Offsets refer to the visible expression, including spaces inside operand names. */
export function tokenizeFormulaInput<
  T extends { label: string; inputText: string },
>(
  text: string,
  operands: readonly T[],
): { raw: string; from: number; operand?: T }[] {
  const choices = operands
    .flatMap((operand) => [
      { raw: operand.inputText, operand },
      { raw: operand.label, operand },
    ])
    .sort((a, b) => b.raw.length - a.raw.length);
  const fallback = new RegExp(tokenPattern, "uy");
  const tokens: { raw: string; from: number; operand?: T }[] = [];
  for (let from = 0; from < text.length;) {
    if (/\s/.test(text[from]!)) {
      from++;
      continue;
    }
    const choice = choices.find(
      ({ raw }) =>
        text.startsWith(raw, from) &&
        (from + raw.length === text.length ||
          /[\s()+*/-]/.test(text[from + raw.length]!)),
    );
    fallback.lastIndex = from;
    const raw = choice?.raw ?? fallback.exec(text)![0];
    tokens.push({ from, raw, operand: choice?.operand });
    from += raw.length;
  }
  return tokens;
}

export function formatMultiQueryFormula(
  tab: MultiQueryTab,
  expression: string,
) {
  const names = new Map(
    formulaOperands(tab).map((op) => [op.reference, op.inputText]),
  );
  return expression.replace(tokenPattern, (token) => names.get(token) ?? token);
}

export function parseMultiQueryFormulaInput(tab: MultiQueryTab, text: string) {
  let stored = "";
  let end = 0;
  for (const { raw, from, operand } of tokenizeFormulaInput(
    text,
    formulaOperands(tab),
  )) {
    if (!operand) continue;
    stored += text.slice(end, from) + operand.reference;
    end = from + raw.length;
  }
  return stored + text.slice(end);
}
