/**
 * Slice at most `maxChars` UTF-16 units, backing off one unit when the
 * boundary would split a surrogate pair. That lone high surrogate renders as
 * U+FFFD. O(1): this does not materialize a longer string.
 */
export function codePointSafeSlice(value: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (value.length <= maxChars) return value;
  const lastUnit = value.charCodeAt(maxChars - 1);
  const isHighSurrogate = lastUnit >= 0xd800 && lastUnit <= 0xdbff;
  return value.slice(0, isHighSurrogate ? maxChars - 1 : maxChars);
}
