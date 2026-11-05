// Convert URLSearchParams to Next.js router query object while preserving arrays
export function urlSearchParamsToQuery(
  params: URLSearchParams,
): Record<string, string | string[]> {
  // Object.fromEntries preserves keys like "__proto__" as own properties.
  return Object.fromEntries(
    Array.from(new Set(params.keys()), (key) => {
      const allValues = params.getAll(key);
      return [key, allValues.length === 1 ? allValues[0] : allValues];
    }),
  );
}
