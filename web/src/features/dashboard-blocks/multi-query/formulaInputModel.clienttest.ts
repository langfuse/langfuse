import { expect, it } from "vitest";
import {
  formulaInputTokens,
  formulaSuggestions,
  type FormulaOperand,
} from "./formulaInputModel";

const operands: FormulaOperand[] = [
  { alias: "A1", name: "Support", metric: "Total cost", scalar: true },
  { alias: "A2", name: "Support", metric: "Token count", scalar: true },
  { alias: "B", name: "Search", metric: "Total cost", scalar: true },
  { alias: "C", name: "Latency", metric: "Histogram", scalar: false },
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
  expect(options.map((o) => o.label)).toEqual(["A1 · Support", "B · Search"]);
  expect(options[1]!.edit).toMatchObject({ next: "(A1 + B) / 1e-3", caret: 7 });
  expect(
    suggestions("(|A2 + B) / 2").options.find((o) => o.id === "Metrics:B")?.edit
      .next,
  ).toBe("(B + B) / 2");
  expect(suggestions("A1 + |").options.map((o) => o.id)).not.toContain(
    "Metrics:C",
  );
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
  ).toBe("(A1 + B)");
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
