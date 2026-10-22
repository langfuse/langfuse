/** Splits typed or pasted text on whitespace, commas, and semicolons. */
export function splitEmailText(text: string) {
  return text.split(/[\s,;]+/);
}
