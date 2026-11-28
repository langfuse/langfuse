type Cell = { value: number | null; unit?: string };
type Operand = (values: ReadonlyMap<string, Cell>) => Cell;

const precedence = new Map([
  ["+", 1],
  ["-", 1],
  ["*", 2],
  ["/", 2],
]);
const token =
  /\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?|[()+*/-]/gy;

/** Compile once per formula, then reuse the expression for each bucket and breakdown. */
export function compileMultiQueryFormula(expression: string) {
  const tokens: string[] = [];
  const scanner = new RegExp(token);
  while (scanner.lastIndex < expression.length) {
    const match = scanner.exec(expression);
    if (!match) throw new Error("Invalid arithmetic expression");
    if (match[0].trim()) tokens.push(match[0]);
    if (tokens.length > 128) throw new Error("Formula is too long");
  }
  let position = 0;
  const refs = new Set<string>();
  const parse = (minimum: number, depth: number): Operand => {
    if (depth > 32) throw new Error("Formula is nested too deeply");
    const next = tokens[position++];
    let left: Operand;
    if (next === "(") {
      left = parse(0, depth + 1);
      if (tokens[position++] !== ")")
        throw new Error("Missing closing parenthesis");
    } else if (next === "-" || next === "+") {
      const child = parse(3, depth + 1);
      left = (values) => {
        const cell = child(values);
        return {
          value: next === "-" && cell.value !== null ? -cell.value : cell.value,
          unit: cell.unit,
        };
      };
    } else if (next && /^[.\d]/.test(next)) {
      const value = Number(next);
      if (!Number.isFinite(value)) throw new Error("Invalid number");
      left = () => ({ value });
    } else if (next && /^[A-Za-z]/.test(next)) {
      refs.add(next);
      left = (values) => {
        const cell = values.get(next);
        if (!cell) throw new Error(`Unknown metric: ${next}`);
        return cell;
      };
    } else throw new Error("Expected a metric or number");
    while (position < tokens.length) {
      const op = tokens[position];
      const priority = precedence.get(op!) ?? -1;
      if (priority < minimum) break;
      position++;
      const first = left;
      const second = parse(priority + 1, depth + 1);
      left = (values) => {
        const a = first(values),
          b = second(values);
        let unit = a.unit ?? b.unit;
        if (op === "+" || op === "-") {
          if (a.unit && b.unit && a.unit !== b.unit)
            throw new Error(
              "Addition and subtraction require compatible units",
            );
        } else if (op === "/") {
          unit = a.unit;
          if (a.unit === b.unit) unit = undefined;
          else if (b.unit) unit = `${a.unit ?? "1"}/${b.unit}`;
        } else if (a.unit && b.unit) unit = `${a.unit}*${b.unit}`;
        if (
          a.value === null ||
          b.value === null ||
          (op === "/" && b.value === 0)
        )
          return { value: null, unit };
        let value = a.value / b.value;
        if (op === "+") value = a.value + b.value;
        if (op === "-") value = a.value - b.value;
        if (op === "*") value = a.value * b.value;
        return { value: Number.isFinite(value) ? value : null, unit };
      };
    }
    return left;
  };
  const evaluate = parse(0, 0);
  if (position !== tokens.length) throw new Error("Unexpected formula token");
  if (!refs.size)
    throw new Error("Reference at least one metric from this tab");
  return { references: [...refs], evaluate };
}
