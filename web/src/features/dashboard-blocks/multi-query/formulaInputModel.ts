import { type ComponentProps } from "react";
import { type QueryTokens } from "@/src/components/design-system/QueryTokens/QueryTokens";
import { type QueryCompletionPlan } from "@/src/components/design-system/QueryInput/QueryInput";
import { tokenizeFormulaInput } from "./formulaOperands";

type InputToken = ComponentProps<typeof QueryTokens>["tokens"][number];

export type FormulaOperand = {
  label: string;
  inputText: string;
  metric: string;
  scalar: boolean;
};

const operators = [
  { symbol: "+", name: "Add" },
  { symbol: "-", name: "Subtract" },
  { symbol: "*", name: "Multiply" },
  { symbol: "/", name: "Divide" },
];

export function formulaInputTokens(value: string, operands: FormulaOperand[]) {
  return tokenizeFormulaInput(value, operands).map(
    ({ raw, from, operand }): InputToken => {
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
      if (operand)
        return {
          ...token,
          kind: "filter",
          groups: [{ noWrap: false, parts: [{ text: raw, tone: "field" }] }],
          explanation: {
            subject: operand.inputText,
            predicate: operand.metric,
          },
          error: operand.scalar
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
      const error = /^["\p{L}_]/u.test(raw)
        ? "Choose a series or metric from this tab."
        : "Use +, -, * or / as the operator.";
      return { ...token, kind: "freeText", error };
    },
  );
}

type Suggestion = {
  id?: string;
  symbol: string;
  name?: string;
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
  // A shorter series can already be a complete operand while the author
  // types a longer name, e.g. "Search er" alongside "Search errors".
  const namePart = (token: InputToken | undefined) =>
    token &&
    token.kind !== "operator" &&
    token.raw !== "(" &&
    token.raw !== ")";
  const end = at && namePart(at) ? index : index - 1;
  let start = end;
  while (start > 0 && namePart(tokens[start - 1])) start--;
  if (start >= 0 && start < end) {
    const candidate = text
      .slice(tokens[start]!.from, caret)
      .trimStart()
      .toLowerCase();
    if (
      candidate &&
      operands.some((op) => op.inputText.toLowerCase().startsWith(candidate))
    ) {
      first = start;
      from = tokens[start]!.from;
      to = Math.max(to, tokens[end]!.to);
      prefix = candidate;
    }
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
      if (
        prefix &&
        !`${op.label} ${op.inputText} ${op.metric}`
          .toLowerCase()
          .includes(prefix)
      )
        continue;
      const option = {
        id: op.label,
        symbol: op.inputText,
        name: op.inputText.includes(op.metric) ? undefined : op.metric,
        section: "Metrics" as const,
      };
      if (prefix && op.label.toLowerCase() === prefix) choices.unshift(option);
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
    options: choices.map(({ id, symbol, name, section }) => {
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
        id: section + ":" + (id ?? symbol),
        label: symbol,
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
