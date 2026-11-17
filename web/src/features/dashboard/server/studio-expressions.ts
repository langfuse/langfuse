export type StudioExpressionValue = { value: number | null; unit?: string };

export function evaluateStudioFormula(
  formula: string,
  values: ReadonlyMap<string, StudioExpressionValue>,
): StudioExpressionValue {
  const compact = formula.replace(/\s+/g, "");
  const tokens =
    compact.match(
      /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?|[()+*/-]/g,
    ) ?? [];
  if (!tokens.length || tokens.length > 128 || tokens.join("") !== compact)
    throw new Error("Invalid arithmetic expression");
  let position = 0;
  const apply = (
    operator: string,
    a: StudioExpressionValue,
    b: StudioExpressionValue,
  ): StudioExpressionValue => {
    if ((operator === "+" || operator === "-") && a.unit !== b.unit)
      throw new Error("Addition and subtraction require compatible units");
    let unit = a.unit;
    if (operator === "/") {
      if (a.unit === b.unit) unit = "ratio";
      else if (b.unit) unit = `${a.unit ?? "1"}/${b.unit}`;
    }
    if (operator === "*")
      unit = a.unit && b.unit ? `${a.unit}*${b.unit}` : (a.unit ?? b.unit);
    if (
      a.value === null ||
      b.value === null ||
      (operator === "/" && b.value === 0)
    )
      return { value: null, unit };
    let value = a.value / b.value;
    if (operator === "+") value = a.value + b.value;
    else if (operator === "-") value = a.value - b.value;
    else if (operator === "*") value = a.value * b.value;
    return { value: Number.isFinite(value) ? value : null, unit };
  };
  const parse = (
    minimumPrecedence: number,
    depth: number,
  ): StudioExpressionValue => {
    if (depth > 32) throw new Error("Expression nesting limit exceeded");
    const token = tokens[position++];
    let left: StudioExpressionValue;
    if (token === "(") {
      left = parse(0, depth + 1);
      if (tokens[position++] !== ")")
        throw new Error("Missing closing parenthesis");
    } else if (token === "-" || token === "+") {
      const operand = parse(3, depth + 1);
      let value = operand.value;
      if (value !== null && token === "-") value = -value;
      left = { value, unit: operand.unit };
    } else if (token && /^\d|^\./.test(token)) {
      const value = Number(token);
      if (!Number.isFinite(value)) throw new Error("Invalid numeric literal");
      left = { value };
    } else if (token && /^[A-Za-z]/.test(token)) {
      const cell = values.get(token);
      if (!cell) throw new Error(`Unknown reference: ${token}`);
      left = cell;
    } else {
      throw new Error("Expected a value");
    }
    while (position < tokens.length) {
      const operator = tokens[position];
      let precedence = -1;
      if (operator === "+" || operator === "-") precedence = 1;
      else if (operator === "*" || operator === "/") precedence = 2;
      if (precedence < minimumPrecedence) break;
      position++;
      left = apply(operator, left, parse(precedence + 1, depth + 1));
    }
    return left;
  };
  const result = parse(0, 0);
  if (position !== tokens.length)
    throw new Error("Unexpected expression token");
  return result;
}

export function studioFormulaReferences(formula: string): string[] {
  const tokens =
    formula.match(
      /(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)?/g,
    ) ?? [];
  return [...new Set(tokens.filter((token) => /^[A-Za-z]/.test(token)))];
}
