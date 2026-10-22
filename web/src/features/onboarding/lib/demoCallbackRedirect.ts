import { env } from "@/src/env.mjs";
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

const getDemoTargetPath = (value: unknown): string | undefined => {
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

/** Same-origin deep link to forward to after the step; undefined for "/", the auth pages and /onboarding. */
export const getDeepLinkCallbackRedirectPath = (
  value: unknown,
): string | undefined => {
  if (typeof value !== "string") return undefined;
  const callbackPath = getCallbackPath(value);
  if (!callbackPath) return undefined;
  return getDeepLinkTargetPath(callbackPath);
};

/** The path a sign-up carries through /onboarding: Cloud keeps demo links only, self-hosted any deep link. */
export const getOnboardingTargetPath = ({
  targetPath,
  isLangfuseCloud,
}: {
  targetPath: unknown;
  isLangfuseCloud: boolean;
}): string | undefined =>
  isLangfuseCloud
    ? getDemoTargetPath(targetPath)
    : getDeepLinkTargetPath(targetPath);

/** callbackUrl of the sign-in right after a credentials sign-up: /onboarding, carrying a path it forwards to. */
export const getSignupCallbackUrl = ({
  targetPath,
  isLangfuseCloud,
}: {
  targetPath: string | undefined;
  isLangfuseCloud: boolean;
}): string => {
  const onboardingPath = `${env.NEXT_PUBLIC_BASE_PATH ?? ""}/onboarding`;
  const onboardingTargetPath = getOnboardingTargetPath({
    targetPath,
    isLangfuseCloud,
  });
  if (onboardingTargetPath) {
    return `${onboardingPath}?targetPath=${encodeURIComponent(onboardingTargetPath)}`;
  }
  if (isLangfuseCloud) return targetPath ?? onboardingPath;
  return onboardingPath;
};

const getDeepLinkTargetPath = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const redirectPath = stripBasePath(getSafeRedirectPath(value));
  const pathname = new URL(redirectPath, "https://langfuse.invalid").pathname;
  return isDeepLinkPathname(pathname) ? redirectPath : undefined;
};

/** "/", the auth pages and the step itself say where a sign-in started, not where the user was headed. */
const isDeepLinkPathname = (pathname: string) =>
  pathname !== "/" &&
  pathname !== "/onboarding" &&
  !pathname.startsWith("/auth/");
