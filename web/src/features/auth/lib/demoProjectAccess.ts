import { getSafeRedirectPath, stripBasePath } from "@/src/utils/redirect";

const DEMO_PATH_PREFIX = "/demo";

export const isDemoTargetPath = (targetPath: string): boolean =>
  targetPath === DEMO_PATH_PREFIX ||
  targetPath.startsWith(`${DEMO_PATH_PREFIX}/`);

export const buildDemoTargetPath = (traceId?: string): string =>
  traceId
    ? `${DEMO_PATH_PREFIX}/${encodeURIComponent(traceId)}`
    : DEMO_PATH_PREFIX;

export const getDemoTargetPath = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const targetPath = stripBasePath(getSafeRedirectPath(value));
  return isDemoTargetPath(targetPath) ? targetPath : undefined;
};

const getSameOriginPath = (url: string): string | null => {
  if (typeof window === "undefined") return null;

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== window.location.origin) return null;
    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch {
    return null;
  }
};

export const getDemoTargetPathFromQueryValue = (
  value: unknown,
): string | undefined => {
  if (typeof value !== "string") return undefined;
  const sameOriginPath = getSameOriginPath(value);
  return getDemoTargetPath(sameOriginPath ?? value);
};

export const getDemoProjectPath = ({
  demoProjectId,
  traceId,
}: {
  demoProjectId: string;
  traceId?: string;
}): string => {
  const encodedProjectId = encodeURIComponent(demoProjectId);

  if (!traceId) {
    return `/project/${encodedProjectId}/traces`;
  }

  return `/project/${encodedProjectId}/traces/${encodeURIComponent(traceId)}`;
};
