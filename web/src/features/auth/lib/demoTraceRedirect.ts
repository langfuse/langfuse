const TRACE_ROUTE_QUERY_KEYS = new Set(["projectId", "traceId"]);

export const buildDemoTraceProjectPath = ({
  projectId,
  traceId,
  query,
}: {
  projectId: string;
  traceId: string;
  query: Record<string, string | string[] | undefined>;
}) => {
  const queryString = buildTraceQueryString(query);

  return `/project/${encodeURIComponent(projectId)}/traces/${encodeURIComponent(
    traceId,
  )}${queryString ? `?${queryString}` : ""}`;
};

export const buildRegionalDemoTraceTargetPath = ({
  traceId,
  query,
}: {
  traceId: string;
  query: Record<string, string | string[] | undefined>;
}) => {
  const queryString = buildTraceQueryString(query);

  return `/demo/traces/${encodeURIComponent(traceId)}${
    queryString ? `?${queryString}` : ""
  }`;
};

const buildTraceQueryString = (
  query: Record<string, string | string[] | undefined>,
) => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (TRACE_ROUTE_QUERY_KEYS.has(key) || typeof value === "undefined") {
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, item));
    } else {
      searchParams.set(key, value);
    }
  }

  return searchParams.toString();
};
