export function getIsCharOrUnderscore(value: string): boolean {
  const charOrUnderscore = /^[A-Za-z_]+$/;

  return charOrUnderscore.test(value);
}

export function extractVariables(mustacheString: string): string[] {
  const mustacheRegex = /\{\{(.*?)\}\}/g;
  const uniqueVariables = new Set<string>();

  for (const match of mustacheString.matchAll(mustacheRegex)) {
    uniqueVariables.add(match[1]);
  }

  for (const variable of uniqueVariables) {
    // if validated fails, remove from set
    if (!getIsCharOrUnderscore(variable)) {
      uniqueVariables.delete(variable);
    }
  }

  return Array.from(uniqueVariables);
}
