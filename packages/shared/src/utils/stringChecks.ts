const JAPANESE_CHAR_RANGE = "\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF";

export function getIsCharOrUnderscore(value: string): boolean {
  const charOrUnderscore = new RegExp(
    `^[a-zA-Z_${JAPANESE_CHAR_RANGE}]+$`,
    "u",
  );

  return charOrUnderscore.test(value);
}

// Regex for valid variable names (letters, underscores, starting with letter)
export const VARIABLE_REGEX = new RegExp(
  `^[a-zA-Z${JAPANESE_CHAR_RANGE}][a-zA-Z${JAPANESE_CHAR_RANGE}_]*$`,
  "u",
);

// Regex to find variables in mustache syntax
export const MUSTACHE_REGEX = /{{([^{}]*)}}+/g;

// Regex to find multiline variables
export const MULTILINE_VARIABLE_REGEX = /{{[^}]*\n[^}]*}}/g;

// Regex to find unclosed variables
export const UNCLOSED_VARIABLE_REGEX = /{{(?![^{]*}})/g;

export function isValidVariableName(variable: string): boolean {
  return VARIABLE_REGEX.test(variable);
}

export function extractVariables(mustacheString: string): string[] {
  const matches = Array.from(mustacheString.matchAll(MUSTACHE_REGEX))
    .map((match) => match[1])
    .filter(isValidVariableName);

  return [...new Set(matches)];
}

export function stringifyValue(value: unknown) {
  switch (typeof value) {
    case "string":
      return value;
    case "number":
      return value.toString();
    case "boolean":
      return value.toString();
    default:
      return JSON.stringify(value);
  }
}
