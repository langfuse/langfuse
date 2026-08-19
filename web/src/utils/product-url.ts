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
