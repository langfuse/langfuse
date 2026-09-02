import { env } from "@/src/env.mjs";

/**
 * Dummy https origin used only so the WHATWG URL parser can resolve the
 * input the same way a browser would. Never returned to callers.
 */
const REDIRECT_ORIGIN = "https://langfuse.invalid";

/**
 * Validates and sanitizes a redirect path to prevent open redirect attacks.
 *
 * Security Requirements:
 * - Only allows path-absolute relative paths that start with "/"
 * - Parses with the WHATWG URL constructor and rejects off-origin results
 *   (protocol-relative, backslash-normalized, absolute http(s), other schemes)
 * - Rejects serialized output that starts with "//" after dot-segment resolution
 * - Automatically prepends NEXT_PUBLIC_BASE_PATH if configured
 *
 * Returned paths are URL-serialized: spaces and control characters are
 * percent-encoded, and dot segments are resolved.
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

  if (typeof targetPath !== "string") {
    return safeDefault;
  }

  const input = targetPath.trim();

  if (!input.startsWith("/")) {
    return safeDefault;
  }

  let url: URL;
  try {
    url = new URL(input, REDIRECT_ORIGIN);
  } catch {
    return safeDefault;
  }

  const path = `${url.pathname}${url.search}${url.hash}`;

  // Origin rejects `/\evil.com` (HTTPS parser resolves it off-site).
  // Leading `//` after serialization rejects `/x/..//evil.com`.
  if (url.origin !== REDIRECT_ORIGIN || path.startsWith("//")) {
    return safeDefault;
  }

  const includesBasePath =
    basePath &&
    (url.pathname === basePath || url.pathname.startsWith(`${basePath}/`));

  return includesBasePath ? path : basePath + path;
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

  // Strip ASCII control characters (0x00-0x1F, 0x7F) so a newline or
  // null byte cannot split the basePath prefix from the remainder.
  const cleaned = path.replace(/[\x00-\x1F\x7F]/g, "");

  const stripped = cleaned.slice(basePath.length) || "/";
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}
