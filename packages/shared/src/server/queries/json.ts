export function replaceIdentifierWithContent(
  stringified: string,
  identifier: string,
  actualContent: string,
): string {
  // Determine if the content should be wrapped in quotes
  const needsQuotes = !isNotJson(actualContent);
  const replacement = needsQuotes ? `"${actualContent}"` : actualContent;

  return stringified.replace(`"${identifier}"`, replacement);
}

export function isNotJson(content: string): boolean {
  if (content === "true" || content === "false") {
    return true;
  }

  if (content === "null") {
    return true;
  }

  if (
    (content.startsWith("{") && content.endsWith("}")) ||
    (content.startsWith("[") && content.endsWith("]"))
  ) {
    return true;
  }

  // Check if it's a number (including negative numbers, decimals, scientific notation, and Infinity)
  if (/^-?(Infinity|\d+(\.\d+)?([eE][+-]?\d+)?)$/.test(content)) {
    return true;
  }

  // Everything else is a string and needs quotes
  return false;
}
