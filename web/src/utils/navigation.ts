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

type BuildTraceDetailPathParams = {
  projectId: string;
  traceId: string;
  observationId?: string | null;
  timestamp?: Date | string | null;
};

function normalizeTimestampParam(
  timestamp: BuildTraceDetailPathParams["timestamp"],
) {
  if (!timestamp) {
    return null;
  }

  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }

  try {
    return decodeURIComponent(timestamp);
  } catch {
    return timestamp;
  }
}

export function buildTraceDetailPath({
  projectId,
  traceId,
  observationId,
  timestamp,
}: BuildTraceDetailPathParams) {
  const params = new URLSearchParams();

  if (observationId) {
    params.set("observation", observationId);
  }

  const normalizedTimestamp = normalizeTimestampParam(timestamp);
  if (normalizedTimestamp) {
    params.set("timestamp", normalizedTimestamp);
  }

  const query = params.toString();

  return `/project/${projectId}/traces/${encodeURIComponent(traceId)}${query ? `?${query}` : ""}`;
}
