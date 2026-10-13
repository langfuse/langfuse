/** Search-bar grammar for a key/value pair. */

export function attributeGrammar(key: string, value: string): string {
  const v = /[\s:"()]/.test(value) ? JSON.stringify(value) : value;
  return `${key}:${v}`;
}
