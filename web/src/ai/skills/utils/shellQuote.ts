// Single quotes keep shell metacharacters in user-defined CLI values literal.
export function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}
