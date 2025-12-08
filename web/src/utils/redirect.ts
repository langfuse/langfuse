import { env } from "@/src/env.mjs";

/**
 * Validates and sanitizes a redirect path to prevent open redirect attacks.
 *
 * Security Requirements:
 * - Only allows relative paths starting with "/" (e.g., "/dashboard", "/project/123")
 * - Blocks protocol-relative URLs (e.g., "//evil.com")
 * - Blocks absolute URLs (e.g., "http://evil.com", "https://evil.com")
 * - Blocks javascript: and data: URIs
 * - Automatically prepends NEXT_PUBLIC_BASE_PATH if configured
 *
 * @param targetPath - The path to validate (typically from query params or user input)
 * @returns A safe redirect path with basePath prepended, or "/" (with basePath) if invalid
 *
 * @example
 * // With NEXT_PUBLIC_BASE_PATH="/my-app"
 * getSafeRedirectPath("/dashboard") // Returns "/my-app/dashboard"
 * getSafeRedirectPath("//evil.com") // Returns "/my-app/" (safe default)
 * getSafeRedirectPath("http://evil.com") // Returns "/my-app/" (safe default)
 *
 * @example
 * // Without NEXT_PUBLIC_BASE_PATH
 * getSafeRedirectPath("/dashboard") // Returns "/dashboard"
 * getSafeRedirectPath("//evil.com") // Returns "/" (safe default)
 */
export function getSafeRedirectPath(
  targetPath: string | undefined | null,
): string {
  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";
  const safeDefault = basePath ? `${basePath}/` : "/";

  // Handle empty/null/undefined
  if (!targetPath || typeof targetPath !== "string") {
    return safeDefault;
  }

  // Trim whitespace
  const trimmed = targetPath.trim();

  if (!trimmed) {
    return safeDefault;
  }

  // Only allow paths starting with "/" but not "//" (protocol-relative URLs)
  // This blocks:
  // - Protocol-relative: "//evil.com"
  // - Absolute URLs: "http://evil.com", "https://evil.com"
  // - JavaScript URIs: "javascript:alert(1)"
  // - Data URIs: "data:text/html,..."
  // - Other schemes: "file://", "ftp://", etc.
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return safeDefault;
  }

  // If basePath is configured, check if the path already starts with it
  // This prevents double-prepending when the path already includes the base path
  if (basePath && trimmed.startsWith(basePath)) {
    return trimmed;
  }

  // Prepend basePath if configured
  return basePath + trimmed;
}

/**
 * Strips NEXT_PUBLIC_BASE_PATH from a path so it can be used with
 * Next.js' router (which already prepends the basePath automatically).
 */
export function stripBasePath(path: string): string {
  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (!basePath) {
    return path || "/";
  }

  if (!path) {
    return "/";
  }

  if (!path.startsWith(basePath)) {
    return path;
  }

  const stripped = path.slice(basePath.length) || "/";
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}
