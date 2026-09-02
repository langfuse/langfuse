import { env } from "@/src/env.mjs";

/**
 * Dummy https origin used only so the WHATWG URL parser can resolve the
 * input the same way a browser would. Never returned to callers.
 */
const SAME_ORIGIN_BASE = "https://langfuse.invalid";
const SAME_ORIGIN = new URL(SAME_ORIGIN_BASE).origin;

function isAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates and sanitizes a redirect path to prevent open redirect attacks.
 *
 * Security Requirements:
 * - Only allows path-absolute relative paths (e.g., "/dashboard", "/project/123")
 * - Blocks any input the WHATWG parser would resolve off the dummy origin
 *   (protocol-relative, backslash-normalized, absolute http(s), other schemes)
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

  const trimmed = targetPath.trim();

  if (!trimmed) {
    return safeDefault;
  }

  // Absolute URLs parse without a base. Reject them so a value such as
  // `https://langfuse.invalid/...` cannot pass the origin check below,
  // and so javascript:/data:/file: schemes never reach the relative parse.
  if (isAbsoluteUrl(trimmed)) {
    return safeDefault;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, SAME_ORIGIN_BASE);
  } catch {
    return safeDefault;
  }

  // Protocol-relative (`//evil.com`), backslash forms (`/\evil.com`),
  // and any other host change fail this check. The parser is the same
  // one the browser uses for `location.assign(path)` / `new URL(path, origin)`.
  if (parsed.origin !== SAME_ORIGIN) {
    return safeDefault;
  }

  // Path-absolute only (`/` or `\`). `dashboard`, `./x`, and `../x`
  // resolve same-origin against the dummy base but are not accepted
  // in-app paths.
  if (!trimmed.startsWith("/") && !trimmed.startsWith("\\")) {
    return safeDefault;
  }

  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;

  // If basePath is configured, check if the path already starts with it
  // This prevents double-prepending when the path already includes the base path
  if (basePath && path.startsWith(basePath)) {
    return path;
  }

  return basePath + path;
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
