const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const SAFE_IMAGE_PROTOCOLS = new Set(["http:", "https:"]);
const SAME_ORIGIN_URL_BASE = "https://langfuse.local";

// Markdown image URLs intentionally stay limited to fetchable http(s) URLs and
// same-origin paths. Do not add data: here; inline base64 media needs separate
// handling from clickable/fetchable markdown URLs.

// The old DOMPurify helper used ALLOWED_TAGS: [] and ALLOWED_ATTR: [], which is
// correct for stripping HTML tags/attributes from a string. It does not validate
// URL protocols when the input is already plain text: "javascript:alert(1)" has
// no markup to remove, so URL safety has to be protocol allowlist based here.
const getSafeUrl = (
  value: string | undefined | null,
  {
    allowedProtocols,
    allowHash = false,
    allowAbsolutePath = true,
  }: {
    allowedProtocols: Set<string>;
    allowHash?: boolean;
    allowAbsolutePath?: boolean;
  },
): string | null => {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    return allowedProtocols.has(parsed.protocol) ? parsed.href : null;
  } catch {
    // Markdown links may point to anchors inside the rendered content.
    if (allowHash && trimmed.startsWith("#")) {
      return trimmed;
    }

    // Allow same-origin app paths, but block protocol-relative and
    // backslash-normalized URLs that browsers can resolve to another host.
    if (
      allowAbsolutePath &&
      trimmed.startsWith("/") &&
      !trimmed.startsWith("//") &&
      !trimmed.includes("\\")
    ) {
      try {
        const parsedPath = new URL(trimmed, SAME_ORIGIN_URL_BASE);
        return parsedPath.origin === SAME_ORIGIN_URL_BASE
          ? `${parsedPath.pathname}${parsedPath.search}${parsedPath.hash}`
          : null;
      } catch {
        return null;
      }
    }

    return null;
  }
};

export const getSafeLinkUrl = (
  value: string | undefined | null,
): string | null =>
  getSafeUrl(value, {
    allowedProtocols: SAFE_LINK_PROTOCOLS,
    allowHash: true,
  });

export const getSafeImageUrl = (
  value: string | undefined | null,
): string | null =>
  getSafeUrl(value, {
    allowedProtocols: SAFE_IMAGE_PROTOCOLS,
  });
