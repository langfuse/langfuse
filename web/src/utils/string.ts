export function lastCharacters(str: string, n: number) {
  return str.substring(str.length - n);
}

export function truncate(str: string, n: number = 16) {
  // '...' suffix if the string is longer than n
  if (str.length > n) {
    return str.substring(0, n) + "...";
  }
  return str;
}

export function getIsCharOrUnderscore(value: string): boolean {
  const charOrUnderscore = /^[A-Za-z_]+$/;

  return charOrUnderscore.test(value);
}

export function validateVariables(content: string): boolean {
  return extractVariables(content).every(getIsCharOrUnderscore);
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
