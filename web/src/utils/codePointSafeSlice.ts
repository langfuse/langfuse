/**
 * Return at most `maxChars` UTF-16 units without ending on half of a
 * surrogate pair. The slice remains O(1), so callers can safely bound
 * multi-megabyte strings without first materializing an array of code points.
 */
export function codePointSafeSlice(value: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }
  if (value.length <= maxChars) {
    return value;
  }

  const lastUnit = value.charCodeAt(maxChars - 1);
  const isHighSurrogate = lastUnit >= 0xd800 && lastUnit <= 0xdbff;
  return value.slice(0, isHighSurrogate ? maxChars - 1 : maxChars);
}
