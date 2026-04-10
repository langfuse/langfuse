import { Parser } from "expr-eval";

/**
 * Sandboxed expression parser for widget multi-query expressions.
 *
 * Allowed: basic arithmetic (+, -, *, /), parentheses, numeric literals,
 *          and the specific query-letter variables provided by the caller.
 *
 * Disabled: exponentiation, all trig/log/math functions, conditionals,
 *           function definitions, assignment, bitwise/logical/comparison ops,
 *           and any variable name not explicitly listed as available.
 */
const SANDBOXED_PARSER = new Parser({
  operators: {
    // Disable structural operators
    power: false,
    factorial: false,
    conditional: false,
    fndef: false,
    assignment: false,
    concatenate: false,
    in: false,
    // Disable all named math functions
    sin: false,
    cos: false,
    tan: false,
    asin: false,
    acos: false,
    atan: false,
    sinh: false,
    cosh: false,
    tanh: false,
    asinh: false,
    acosh: false,
    atanh: false,
    sqrt: false,
    cbrt: false,
    log: false,
    ln: false,
    lg: false,
    log10: false,
    log1p: false,
    log2: false,
    // Safe rounding / clamping functions — keep enabled
    // abs, ceil, floor, round, trunc, min, max are intentionally omitted here
    exp: false,
    expm1: false,
    random: false,
    sign: false,
    length: false,
    // Disable comparison/logical
    comparison: false,
    logical: false,
  },
});

/** Functions explicitly kept enabled in the sandboxed parser. */
export const ALLOWED_FUNCTIONS = new Set([
  "abs",
  "ceil",
  "floor",
  "round",
  "trunc",
  "min",
  "max",
]);

const MAX_PAREN_DEPTH = 5;

function getParenDepth(expression: string): number {
  let depth = 0;
  let max = 0;
  for (const ch of expression) {
    if (ch === "(") max = Math.max(max, ++depth);
    else if (ch === ")") depth--;
  }
  return max;
}

export type ExpressionValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

/**
 * Validates an expression string against the available query letters.
 * Uses symbols() (not just variables()) so that unknown function calls
 * like foo() are also caught at validation time rather than at evaluation.
 */
export function validateExpression(
  expression: string,
  availableVars: string[],
): ExpressionValidationResult {
  const trimmed = expression.trim();
  if (!trimmed) return { valid: true };

  if (getParenDepth(trimmed) > MAX_PAREN_DEPTH) {
    return {
      valid: false,
      reason: `Expression is too deeply nested (max depth: ${MAX_PAREN_DEPTH}).`,
    };
  }

  try {
    const parsed = SANDBOXED_PARSER.parse(trimmed);
    // symbols() returns every identifier: variables AND function names.
    // Validate all of them against the allowed set so foo() is caught here
    // rather than silently failing at evaluation time.
    const allowedSet = new Set([...availableVars, ...ALLOWED_FUNCTIONS]);
    const unknown = parsed.symbols().filter((s) => !allowedSet.has(s));
    if (unknown.length > 0) {
      const available =
        availableVars.length > 0 ? availableVars.join(", ") : "none yet";
      return {
        valid: false,
        reason: `Unknown symbol${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}. Available variables: ${available}; functions: ${[...ALLOWED_FUNCTIONS].join(", ")}`,
      };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, reason: String(e) };
  }
}

/**
 * Evaluates a (pre-validated) expression with the given variable values.
 * Throws on parse or runtime errors.
 */
export function evaluateExpression(
  expression: string,
  values: Record<string, number>,
): number {
  return SANDBOXED_PARSER.evaluate(expression, values) as number;
}
