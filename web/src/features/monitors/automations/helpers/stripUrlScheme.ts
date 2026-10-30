const schemePattern = /^\s*https?:\/\//i;

/** stripUrlScheme drops a typed or pasted http(s) scheme, which the field's fixed prefix already shows. */
export function stripUrlScheme(value: string): string {
  return value.replace(schemePattern, "");
}
