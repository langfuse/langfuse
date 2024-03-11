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

export function extractVariables(mustacheString: string): string[] {
  // Regular expression to match Mustache variables
  const regex: RegExp = /\{\{(.*?)\}\}/g;

  let match: RegExpExecArray | null;
  const variables: string[] = [];

  // Iterate over all matches
  while ((match = regex.exec(mustacheString)) !== null) {
    // Push each variable to the array if it's not already present
    const variable = match[1];
    if (variable && !variables.includes(variable)) {
      variables.push(variable);
    }
  }

  return variables;
}
