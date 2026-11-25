import { type ComponentProps } from "react";
import { type QueryTokens } from "@/src/components/design-system/QueryTokens/QueryTokens";
import { type QueryCompletionPlan } from "@/src/components/design-system/QueryInput/QueryInput";

type InputToken = ComponentProps<typeof QueryTokens>["tokens"][number];

export type FormulaOperand = {
  alias: string;
  name: string;
  metric: string;
  scalar: boolean;
};

// Includes unfinished exponents and unrecognized characters so every draft can
// be rendered and corrected, even when it cannot be evaluated yet.
const tokenPattern =
  /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d*)?|[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?|[^\s]/gu;
const operators = [
  { symbol: "+", name: "Add" },
  { symbol: "-", name: "Subtract" },
  { symbol: "*", name: "Multiply" },
  { symbol: "/", name: "Divide" },
];

export function formulaInputTokens(value: string, operands: FormulaOperand[]) {
  return Array.from(
    value.matchAll(tokenPattern),
    ({ 0: raw, index: from }): InputToken => {
      const item = operands.find((op) => op.alias === raw);
      const token = {
        id: String(from),
        from,
        to: from + raw.length,
        raw,
        editable: false,
        error: null,
        explanation: null,
        inactiveReason: null,
      };
      if (item)
        return {
          ...token,
          kind: "filter",
          groups: [{ noWrap: true, parts: [{ text: raw, tone: "field" }] }],
          explanation: { subject: item.name, predicate: item.metric },
          error: item.scalar
            ? null
            : "Choose a scalar metric. A histogram contains multiple values.",
        };
      if (/^[\d.]/.test(raw))
        return {
          ...token,
          kind: "paren",
          groups: [{ noWrap: true, parts: [{ text: raw, tone: "number" }] }],
          error: Number.isFinite(Number(raw)) ? null : "Finish the number.",
        };
      if (raw === "(" || raw === ")") return { ...token, kind: "paren" };
      if (operators.some((op) => op.symbol === raw))
        return { ...token, kind: "operator" };
      const error = /^[A-Za-z]/.test(raw)
        ? "Choose a series or metric from this tab."
        : "Use +, -, * or / as the operator.";
      return { ...token, kind: "freeText", error };
    },
  );
}

type Suggestion = {
  symbol: string;
  name: string;
  label?: string;
  section: "Metrics" | "Operators" | "Grouping";
};

/** Each completion owns its replacement span. Picking inside an expression
 * must leave its neighboring operands, operators and whitespace intact. */
export function formulaSuggestions(
  text: string,
  caret: number,
  operands: FormulaOperand[],
  tokens: InputToken[],
  onPick: (kind: "metric" | "syntax") => void,
): QueryCompletionPlan {
  const nextIndex = tokens.findIndex((t) => t.to > caret);
  const index = nextIndex < 0 ? tokens.length : nextIndex;
  const right = tokens[index];
  const at = right && right.from <= caret ? right : undefined;
  const previous = tokens[index - 1];
  let first = index;
  let from = caret;
  let to = caret;
  let prefix = "";

  // Search by a series or metric name, including several words. An adjacent
  // operator or closing group is a boundary and stays in the expression.
  if (at?.kind === "freeText" || previous?.kind === "freeText") {
    let last = at?.kind === "freeText" ? index : index - 1;
    first = last;
    while (tokens[first - 1]?.kind === "freeText") first--;
    while (tokens[last + 1]?.kind === "freeText") last++;
    from = tokens[first]!.from;
    to = Math.max(tokens[last]!.to, caret);
    prefix = text.slice(from, caret).trim().toLowerCase();
  } else if (at && at.raw !== ")" && at.kind !== "operator") {
    from = at.from;
    to = at.to;
  }
  const before = tokens[first - 1];
  const needsOperand =
    !before || before.raw === "(" || before.kind === "operator";
  const depth = tokens
    .slice(0, first)
    .reduce((n, t) => n + Number(t.raw === "(") - Number(t.raw === ")"), 0);
  const choices: Suggestion[] = [];
  if (needsOperand) {
    for (const op of operands) {
      if (!op.scalar) continue;
      const label = `${op.alias} · ${op.name}`;
      if (prefix && !`${label} ${op.metric}`.toLowerCase().includes(prefix))
        continue;
      const option = {
        symbol: op.alias,
        label,
        name: op.metric,
        section: "Metrics" as const,
      };
      if (prefix && op.alias.toLowerCase() === prefix) choices.unshift(option);
      else choices.push(option);
    }
    if (!prefix) {
      choices.push({ symbol: "(", name: "Open group", section: "Grouping" });
      choices.push({ symbol: "-", name: "Negate", section: "Operators" });
    }
  } else {
    choices.push(
      ...operators.map((op) => ({ ...op, section: "Operators" as const })),
    );
    if (depth > 0)
      choices.push({ symbol: ")", name: "Close group", section: "Grouping" });
  }

  return {
    autoHighlight: Boolean(prefix),
    loading: false,
    options: choices.map(({ symbol, label, name, section }) => {
      const binary = section === "Operators" && !needsOperand;
      // Picking a new operator replaces the adjacent operator; choosing to
      // close a group ahead of it preserves that operator. Typing into an
      // existing closing parenthesis likewise never drops the parenthesis.
      let start = from;
      let end = to;
      if (
        (!prefix && binary && right?.kind === "operator") ||
        (symbol === ")" && right?.raw === ")")
      ) {
        start = right.from;
        end = right.to;
      } else if (!prefix && section !== "Metrics") {
        // Insert missing syntax before the existing right operand or group.
        end = start;
      } else if (
        !prefix &&
        section === "Metrics" &&
        right &&
        !at &&
        (right.kind === "filter" || /^[.\d]/.test(right.raw))
      ) {
        start = right.from;
        end = right.to;
      }
      const leftText = text.slice(0, start);
      const rightText = text.slice(end);
      const leading = binary && leftText && !/\s$/.test(leftText) ? " " : "";
      const trailing = binary && !/^\s/.test(rightText) ? " " : "";
      const inserted = leading + symbol + trailing;
      return {
        id: section + ":" + symbol,
        label: label ?? symbol,
        detail: name,
        section,
        icon: section === "Metrics" ? "search" : "syntax",
        labelColor: section === "Metrics" ? "blue" : "default",
        edit: {
          next: leftText + inserted + rightText,
          caret: start + inserted.length,
          keepOpen: true,
        },
        onApplied: () => onPick(section === "Metrics" ? "metric" : "syntax"),
      };
    }),
  };
}
