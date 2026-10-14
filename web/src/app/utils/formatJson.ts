/** Indents valid JSON without changing number tokens, string escapes, or key order. */
export function formatJson(text: string) {
  try {
    // Discard the parsed values: numbers may have lost precision during validation.
    JSON.parse(text);
  } catch {
    return null;
  }

  const tokens =
    text.match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|[^\s{}\[\],:]+/g) ?? [];
  const formatted: string[] = [];
  let depth = 0;
  for (const [index, token] of tokens.entries()) {
    if (token === "{" || token === "[") {
      formatted.push(token);
      depth += 1;
      if (tokens[index + 1] !== "}" && tokens[index + 1] !== "]") {
        formatted.push("\n", "  ".repeat(depth));
      }
      continue;
    }
    if (token === "}" || token === "]") {
      depth -= 1;
      if (tokens[index - 1] !== "{" && tokens[index - 1] !== "[") {
        formatted.push("\n", "  ".repeat(depth));
      }
      formatted.push(token);
      continue;
    }
    if (token === ",") {
      formatted.push(",\n", "  ".repeat(depth));
      continue;
    }
    if (token === ":") {
      formatted.push(": ");
      continue;
    }
    formatted.push(token);
  }
  return formatted.join("");
}
