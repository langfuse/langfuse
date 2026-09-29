// Convert URLSearchParams to Next.js router query object while preserving arrays
export function urlSearchParamsToQuery(
  params: URLSearchParams,
): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  const keys = Array.from(new Set(params.keys())); // Get unique keys

  for (const key of keys) {
    const allValues = params.getAll(key);
    query[key] = allValues.length === 1 ? allValues[0] : allValues;
  }

  return query;
}
