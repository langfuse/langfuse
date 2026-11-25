import { useRef, useState } from "react";
import {
  type MultiQueryFormula,
  type MultiQueryTab,
} from "@langfuse/shared/dashboards";
import {
  QueryInput,
  useQueryInputController,
} from "@/src/components/design-system/QueryInput/QueryInput";
import {
  formatMultiQueryFormula,
  parseMultiQueryFormulaInput,
  formulaOperands,
} from "./multiQueryFormulas";
import { formulaInputTokens, formulaSuggestions } from "./formulaInputModel";
import { multiQueryMetricLabel } from "./multiQueryModel";

const syntaxHints = new Map([
  [
    "Unexpected formula token",
    "Separate values with an operator and check the parentheses.",
  ],
  [
    "Expected a metric or number",
    "Enter a metric or number to finish the expression.",
  ],
  ["Missing closing parenthesis", "Add a closing parenthesis."],
  [
    "Reference at least one metric from this tab",
    "Include at least one metric from this tab.",
  ],
]);

export function MultiQueryFormulaInput({
  tab,
  formula,
  validationMessage,
  onChange,
  track,
}: {
  tab: MultiQueryTab;
  formula: MultiQueryFormula;
  validationMessage?: string;
  onChange: (formula: MultiQueryFormula) => void;
  track: (action: string) => void;
}) {
  const controller = useQueryInputController();
  const [focused, setFocused] = useState(false);
  const [revealError, setRevealError] = useState(false);
  const beforeEdit = useRef(formula.expression);
  const value = formatMultiQueryFormula(tab, formula.expression);
  const operands = formulaOperands(tab).map(({ label, query, metric }) => ({
    alias: label,
    name: query.label,
    metric: multiQueryMetricLabel(metric),
    scalar: metric.aggregation !== "histogram",
  }));
  const tokens = formulaInputTokens(value, operands);
  const tokenError = tokens.find((t) => t.error)?.error;
  const message =
    tokenError ??
    (value.trim()
      ? (syntaxHints.get(validationMessage ?? "") ?? validationMessage)
      : "Choose a metric from this tab.");
  const diagnostic =
    revealError || (!focused && value.trim()) ? message : undefined;
  const update = (next: string) => {
    setRevealError(false);
    onChange({
      ...formula,
      expression: parseMultiQueryFormulaInput(tab, next.slice(0, 1024)),
    });
  };
  const id = tab.id + "-" + formula.id;
  return (
    <div
      className="flex flex-col gap-1"
      onFocusCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocused(true);
          beforeEdit.current = formula.expression;
        }
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <label className="text-xs font-medium" htmlFor={id}>
        Formula
      </label>
      <QueryInput
        inputId={id}
        label="Formula expression"
        value={value}
        placeholder="Choose a metric or type a number"
        controller={controller}
        tokens={
          diagnostic
            ? tokens.map((t) => (t.error ? { ...t, kind: "invalid" } : t))
            : tokens
        }
        diagnostics={diagnostic ? [{ message: diagnostic }] : []}
        completions={
          controller.autocompleteOpen
            ? formulaSuggestions(
                value,
                controller.selectionSnapshot.end,
                operands,
                tokens,
                (kind) =>
                  track(
                    kind === "metric"
                      ? "multi_query_formula_operand_inserted"
                      : "multi_query_formula_operator_inserted",
                  ),
              )
            : null
        }
        onValueChange={update}
        onCommit={(next, reason) => {
          setRevealError(
            Boolean(next.trim() || beforeEdit.current.trim()) ||
              reason === "enter",
          );
          const stored = parseMultiQueryFormulaInput(tab, next).trim();
          if (reason === "blur" && beforeEdit.current.trim() !== stored) {
            track("multi_query_formula_edited");
            beforeEdit.current = stored;
          }
          return message ? null : next;
        }}
        areEquivalent={(left, right) => left.trim() === right.trim()}
        onRemoveToken={(token) =>
          update(value.slice(0, token.from) + value.slice(token.to))
        }
      />
      {diagnostic && <p className="text-destructive text-xs">{diagnostic}</p>}
    </div>
  );
}
