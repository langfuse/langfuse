const SAFE_LINK_PROTOCOLS = new Set([
  "http:",
  "https:",
  "irc:",
  "ircs:",
  "mailto:",
  "tel:",
  "xmpp:",
]);
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
    allowSearch = false,
    allowRelativePath = true,
  }: {
    allowedProtocols: Set<string>;
    allowHash?: boolean;
    allowSearch?: boolean;
    allowRelativePath?: boolean;
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

    if (allowSearch && trimmed.startsWith("?")) {
      return isSafeSameOriginReference(trimmed) ? trimmed : null;
    }

    if (allowRelativePath && isRelativePathReference(trimmed)) {
      return isSafeSameOriginReference(trimmed) ? trimmed : null;
    }

    return null;
  }
};

const isRelativePathReference = (value: string): boolean =>
  value.startsWith("/") ||
  value.startsWith("./") ||
  value.startsWith("../") ||
  /^[^/?#]/.test(value);

const isSafeSameOriginReference = (value: string): boolean => {
  // Block protocol-relative and backslash-normalized URLs. Browsers can resolve
  // values like "/\\attacker.example/x" to another host for http(s) documents.
  if (value.startsWith("//") || value.includes("\\")) return false;

  try {
    const parsed = new URL(value, SAME_ORIGIN_URL_BASE);
    return parsed.origin === SAME_ORIGIN_URL_BASE;
  } catch {
    return false;
  }
};

export const getSafeLinkUrl = (
  value: string | undefined | null,
): string | null =>
  getSafeUrl(value, {
    allowedProtocols: SAFE_LINK_PROTOCOLS,
    allowHash: true,
    allowSearch: true,
  });

export const getSafeImageUrl = (
  value: string | undefined | null,
): string | null =>
  getSafeUrl(value, {
    allowedProtocols: SAFE_IMAGE_PROTOCOLS,
  });
