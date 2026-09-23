import { getSafeRedirectPath, stripBasePath } from "@/src/utils/redirect";

const getCallbackPath = (url: string): string | null => {
  if (typeof window === "undefined") return null;
  if (!/^(\/|https?:\/\/)/i.test(url)) return null;

  try {
    const parsedUrl = new URL(url, window.location.origin);
    if (parsedUrl.origin !== window.location.origin) return null;
    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  } catch {
    return null;
  }
};

export const getDemoTargetPath = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const redirectPath = stripBasePath(getSafeRedirectPath(value));
  const pathname = new URL(redirectPath, "https://langfuse.invalid").pathname;
  return pathname === "/demo" || pathname.startsWith("/demo/")
    ? redirectPath
    : undefined;
};

export const getDemoCallbackRedirectPath = (
  value: unknown,
): string | undefined => {
  if (typeof value !== "string") return undefined;
  const callbackPath = getCallbackPath(value);
  if (!callbackPath) return undefined;
  return getDemoTargetPath(callbackPath);
};
