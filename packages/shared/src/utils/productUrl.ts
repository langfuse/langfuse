type BuildTraceDetailPathParams = {
  projectId: string;
  traceId: string;
  observationId?: string | null;
  timestamp?: Date | string | null;
};

const decodeURIComponentSafely = (value?: string | null) => {
  if (!value) {
    return undefined;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const buildTraceDetailPath = (params: BuildTraceDetailPathParams) => {
  const searchParams = new URLSearchParams();
  const timestamp =
    params.timestamp instanceof Date
      ? params.timestamp.toISOString()
      : decodeURIComponentSafely(params.timestamp);

  if (params.observationId) {
    searchParams.set("observation", params.observationId);
  }

  if (timestamp) {
    searchParams.set("timestamp", timestamp);
  }

  const query = searchParams.toString();
  const path = `/project/${encodeURIComponent(params.projectId)}/traces/${encodeURIComponent(params.traceId)}`;

  return query ? `${path}?${query}` : path;
};
