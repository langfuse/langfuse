/** headerValue normalizes a possibly-repeated header to its first value. */
export const headerValue = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);
