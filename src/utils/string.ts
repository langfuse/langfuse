export function lastCharacters(str: string, n: number) {
  return str.substring(str.length - n);
}

export function extractVariables(mustacheString: string): string[] {
  // Regular expression to match Mustache variables
  const regex: RegExp = /\{\{(.*?)\}\}/g;

  let match: RegExpExecArray | null;
  const variables: string[] = [];

  // Iterate over all matches
  while ((match = regex.exec(mustacheString)) !== null) {
    // Push each variable to the array
    const variable = match[1];
    if (variable) variables.push(variable);
  }

  return variables;
}
