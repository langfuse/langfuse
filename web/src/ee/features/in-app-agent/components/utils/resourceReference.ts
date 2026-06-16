export type InAppAgentResourceReference =
  | {
      type: "trace";
      id: string;
    }
  | {
      type: "observation";
      id: string;
      traceId: string;
    }
  | {
      type: "score";
      id: string;
    };

const SCORE_ROUTES = new Set(["analytics"]);

const getPathSegments = (url: URL) => {
  const segments: string[] = [];

  for (const segment of url.pathname.split("/")) {
    if (!segment) {
      continue;
    }

    try {
      segments.push(decodeURIComponent(segment));
    } catch {
      return null;
    }
  }

  return segments;
};

export const parseInAppAgentResourceHref = (
  href: string | undefined,
): InAppAgentResourceReference | null => {
  if (!href) {
    return null;
  }

  const trimmedHref = href.trim();
  if (!trimmedHref) {
    return null;
  }

  return parseLangfuseProductResourceHref(trimmedHref);
};

const parseLangfuseProductResourceHref = (
  href: string,
): InAppAgentResourceReference | null => {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  if (!isLangfuseProductHost(url.hostname)) {
    return null;
  }

  const segments = getPathSegments(url);
  if (!segments) {
    return null;
  }

  const projectIndex = segments.indexOf("project");
  if (projectIndex === -1 || !segments[projectIndex + 1]) {
    return null;
  }

  const resourceType = segments[projectIndex + 2];
  const resourceId = segments[projectIndex + 3];

  if (resourceType === "traces" && resourceId) {
    const observationId = url.searchParams.get("observation")?.trim();
    if (observationId) {
      return { type: "observation", id: observationId, traceId: resourceId };
    }

    return { type: "trace", id: resourceId };
  }

  if (resourceType === "scores") {
    const scoreId =
      (resourceId && !SCORE_ROUTES.has(resourceId) ? resourceId : undefined) ??
      url.searchParams.get("scoreId")?.trim() ??
      url.searchParams.get("score")?.trim();

    return scoreId ? { type: "score", id: scoreId } : null;
  }

  return null;
};

const isLangfuseProductHost = (hostname: string) => {
  const normalizedHostname = hostname.toLowerCase();

  return (
    normalizedHostname === "localhost" ||
    normalizedHostname === "127.0.0.1" ||
    normalizedHostname === "::1" ||
    normalizedHostname === "[::1]" ||
    normalizedHostname === "langfuse.com" ||
    normalizedHostname.endsWith(".langfuse.com")
  );
};
