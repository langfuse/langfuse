import { expect, it } from "vitest";
import {
  formulaInputTokens,
  formulaSuggestions,
  type FormulaOperand,
} from "./formulaInputModel";

const operands: FormulaOperand[] = [
  {
    label: "A1",
    inputText: "Support · Total cost",
    metric: "Total cost",
    scalar: true,
  },
  {
    label: "A2",
    inputText: "Support · Token count",
    metric: "Token count",
    scalar: true,
  },
  {
    label: "B",
    inputText: "Search",
    metric: "Total cost",
    scalar: true,
  },
  {
    label: "C",
    inputText: "Latency",
    metric: "Histogram",
    scalar: false,
  },
  {
    label: "D",
    inputText: "Search errors",
    metric: "Count",
    scalar: true,
  },
  {
    label: "E",
    inputText: '"Cost / request"',
    metric: "Cost",
    scalar: true,
  },
];
const suggestions = (marked: string) => {
  const caret = marked.indexOf("|");
  const value = marked.replace("|", "");
  return formulaSuggestions(
    value,
    caret,
    operands,
    formulaInputTokens(value, operands),
    () => {},
  );
};

it("completes a series or metric by name at the caret and preserves the rest of the formula", () => {
  const options = suggestions("(A1 + total co|) / 1e-3").options;
  expect(options.map((o) => o.label)).toEqual([
    "Support · Total cost",
    "Search",
  ]);
  expect(options[1]!.edit).toMatchObject({
    next: "(A1 + Search) / 1e-3",
    caret: 12,
  });
  expect(
    suggestions("(|A2 + B) / 2").options.find((o) => o.id === "Metrics:B")?.edit
      .next,
  ).toBe("(Search + B) / 2");
  expect(suggestions("A1 + |").options.map((o) => o.id)).not.toContain(
    "Metrics:C",
  );
  expect(
    suggestions("B + Search er| + 10").options.find(
      (o) => o.label === "Search errors",
    )?.edit,
  ).toMatchObject({ next: "B + Search errors + 10", caret: 17 });
  expect(
    suggestions('("Cost / req|').options.find(
      (o) => o.label === '"Cost / request"',
    )?.edit,
  ).toMatchObject({ next: '("Cost / request"', caret: 17 });
});

it("offers operators after numeric or series operands and closes only an open group", () => {
  const options = suggestions("-(B / 1e-3|").options;
  expect(options.map((o) => o.label)).toEqual(["+", "-", "*", "/", ")"]);
  expect(options.at(-1)?.edit.next).toBe("-(B / 1e-3)");
  expect(
    suggestions("(A1|)").options.find((o) => o.label === "+")?.edit.next,
  ).toBe("(A1 + )");
  expect(
    suggestions("(A1 + |)").options.find((o) => o.id === "Metrics:B")?.edit
      .next,
  ).toBe("(A1 + Search)");
  for (const right of ["B", "(B + A2)"]) {
    const edit = suggestions(`A1 |${right}`).options.find(
      (o) => o.label === "*",
    )?.edit;
    expect(edit).toMatchObject({ next: `A1 * ${right}`, caret: 5 });
  }
  expect(suggestions("A1|").options.map((o) => o.label)).toEqual([
    "+",
    "-",
    "*",
    "/",
  ]);
  expect(
    suggestions("A1 |/ B").options.find((o) => o.label === "*")?.edit.next,
  ).toBe("A1 * B");
});
